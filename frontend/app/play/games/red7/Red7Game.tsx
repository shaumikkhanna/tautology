"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { RealtimeChannel, User } from "@supabase/supabase-js";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import {
  cardsEqual,
  ruleLabel,
  winningPlayer,
} from "./red7Engine";
import type {
  Red7Card,
  Red7Player,
  Red7PublicState,
} from "./red7Types";
import styles from "./red7.module.css";

const PLAY_PATH = "/play/games/red7";
const NAME_STORAGE_KEY = "red7-display-name";
const HEARTBEAT_MS = 5_000;

type ScreenState =
  | "loading"
  | "home"
  | "join"
  | "room"
  | "configuration-error"
  | "room-error"
  | "kicked";

export function Red7Game({ roomCode }: { roomCode?: string }) {
  const supabase = useMemo(() => createBrowserSupabaseClient(), []);
  const [screen, setScreen] = useState<ScreenState>(
    supabase ? "loading" : "configuration-error",
  );
  const [user, setUser] = useState<User | null>(null);
  const [state, setState] = useState<Red7PublicState | null>(null);
  const [displayName, setDisplayName] = useState("");
  const [joinCode, setJoinCode] = useState("");
  const [drawRule, setDrawRule] = useState(false);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [onlineUserIds, setOnlineUserIds] = useState<Set<string>>(new Set());

  const applyState = useCallback((
    nextState: Red7PublicState,
    clearMessage = true,
  ) => {
    setState(nextState);
    setScreen("room");
    if (clearMessage) {
      setMessage("");
    }
  }, []);

  const loadState = useCallback(
    async (code: string, quiet = false) => {
      if (!supabase) {
        return false;
      }

      const { data, error } = await supabase.rpc("red7_get_state", {
        room_code: code,
      });

      if (error) {
        if (!quiet) {
          const normalized = readableError(error.message);
          if (normalized.includes("Join the room first")) {
            setScreen("join");
          } else if (normalized.includes("no longer in this room")) {
            setScreen("kicked");
          } else {
            setMessage(normalized);
            setScreen("room-error");
          }
        }
        return false;
      }

      applyState(data as unknown as Red7PublicState, !quiet);
      return true;
    },
    [applyState, supabase],
  );

  useEffect(() => {
    if (!supabase) {
      return;
    }

    const client = supabase;
    let cancelled = false;

    async function initialize() {
      const savedName = window.localStorage.getItem(NAME_STORAGE_KEY) ?? "";
      setDisplayName(savedName);

      if (!roomCode) {
        setScreen("home");
      }

      const { data: sessionData } = await client.auth.getSession();
      let nextUser = sessionData.session?.user ?? null;

      if (!nextUser && roomCode) {
        const { data, error } = await client.auth.signInAnonymously();
        if (error) {
          if (!cancelled) {
            setMessage(
              "Anonymous Supabase sign-in is unavailable. Enable anonymous sign-ins for this project.",
            );
            setScreen("configuration-error");
          }
          return;
        }
        nextUser = data.user;
      }

      if (cancelled) {
        return;
      }

      setUser(nextUser);
      if (roomCode) {
        const loaded = await loadState(roomCode);
        if (!loaded && !cancelled) {
          setScreen((current) =>
            current === "loading" ? "join" : current,
          );
        }
      }
    }

    void initialize();
    return () => {
      cancelled = true;
    };
  }, [loadState, roomCode, supabase]);

  async function ensureAuthenticated() {
    if (!supabase) {
      setMessage("Supabase is not configured.");
      return null;
    }

    if (user) {
      return user;
    }

    const { data, error } = await supabase.auth.signInAnonymously();
    if (error || !data.user) {
      setMessage(
        "Anonymous Supabase sign-in is unavailable. Enable anonymous sign-ins for this project.",
      );
      return null;
    }

    setUser(data.user);
    return data.user;
  }

  useEffect(() => {
    if (!supabase || !state || !user || screen !== "room") {
      return;
    }

    const roomId = state.room.id;
    let channel: RealtimeChannel;

    const refresh = () => {
      void loadState(state.room.code, true);
    };

    channel = supabase
      .channel(`red7:${roomId}`, {
        config: { presence: { key: user.id } },
      })
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "red7_rooms",
          filter: `id=eq.${roomId}`,
        },
        refresh,
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "red7_players",
          filter: `room_id=eq.${roomId}`,
        },
        refresh,
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "red7_hands",
          filter: `user_id=eq.${user.id}`,
        },
        refresh,
      )
      .on("presence", { event: "sync" }, () => {
        setOnlineUserIds(new Set(Object.keys(channel.presenceState())));
      })
      .subscribe(async (status) => {
        if (status === "SUBSCRIBED") {
          await channel.track({
            userId: user.id,
            playerId: state.privateState.playerId,
          });
        }
      });

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [
    loadState,
    screen,
    state?.privateState.playerId,
    state?.room.code,
    state?.room.id,
    supabase,
    user,
  ]);

  useEffect(() => {
    if (!supabase || !state || screen !== "room") {
      return;
    }

    let cancelled = false;
    const heartbeat = async () => {
      const { data, error } = await supabase.rpc("red7_heartbeat", {
        room_code: state.room.code,
      });

      if (cancelled) {
        return;
      }

      if (error) {
        const nextMessage = readableError(error.message);
        if (nextMessage.includes("no longer in this room")) {
          setScreen("kicked");
          setMessage("The host removed you from the room.");
        }
        return;
      }

      applyState(data as unknown as Red7PublicState, false);
    };

    void heartbeat();
    const timer = window.setInterval(() => void heartbeat(), HEARTBEAT_MS);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [applyState, screen, state?.room.code, supabase]);

  async function createRoom() {
    if (!supabase || !displayName.trim()) {
      setMessage("Enter your name.");
      return;
    }

    setBusy(true);
    setMessage("");
    const activeUser = await ensureAuthenticated();
    if (!activeUser) {
      setBusy(false);
      return;
    }
    window.localStorage.setItem(NAME_STORAGE_KEY, displayName.trim());

    const { data, error } = await supabase.rpc("red7_create_room", {
      display_name: displayName.trim(),
      enable_draw_rule: drawRule,
    });

    setBusy(false);
    if (error) {
      setMessage(readableError(error.message));
      return;
    }

    const nextState = data as unknown as Red7PublicState;
    window.history.replaceState(
      {},
      "",
      `${PLAY_PATH}/room/${nextState.room.code}`,
    );
    applyState(nextState);
  }

  async function joinRoom() {
    if (!supabase || !displayName.trim()) {
      setMessage("Enter your name.");
      return;
    }

    const code = roomCode ?? extractRoomCode(joinCode);
    if (!code) {
      setMessage("Paste a Red7 room link or code.");
      return;
    }

    setBusy(true);
    setMessage("");
    const activeUser = await ensureAuthenticated();
    if (!activeUser) {
      setBusy(false);
      return;
    }
    window.localStorage.setItem(NAME_STORAGE_KEY, displayName.trim());

    const { data, error } = await supabase.rpc("red7_join_room", {
      room_code: code,
      display_name: displayName.trim(),
    });

    setBusy(false);
    if (error) {
      setMessage(readableError(error.message));
      return;
    }

    window.history.replaceState({}, "", `${PLAY_PATH}/room/${code}`);
    applyState(data as unknown as Red7PublicState);
  }

  async function runRoomRpc(
    call: () => PromiseLike<{
      data: unknown;
      error: { message: string } | null;
    }>,
  ) {
    setBusy(true);
    setMessage("");
    const { data, error } = await call();
    setBusy(false);

    if (error) {
      await loadState(state?.room.code ?? "", true);
      setMessage(readableError(error.message));
      return;
    }

    applyState(data as Red7PublicState);
  }

  if (screen === "configuration-error") {
    return (
      <Page>
        <StatusPanel title="Red7 unavailable" message={message || "Supabase is not configured."} />
      </Page>
    );
  }

  if (screen === "loading") {
    return (
      <Page>
        <StatusPanel title="Red7" message="Connecting to the table..." />
      </Page>
    );
  }

  if (screen === "room-error") {
    return (
      <Page>
        <StatusPanel title="Could not open room" message={message}>
          <a className={styles.buttonLink} href={PLAY_PATH}>
            Back to Red7
          </a>
        </StatusPanel>
      </Page>
    );
  }

  if (screen === "kicked") {
    return (
      <Page>
        <StatusPanel title="Removed from room" message={message}>
          <button type="button" onClick={() => setScreen("join")}>
            Rejoin as spectator
          </button>
        </StatusPanel>
      </Page>
    );
  }

  if (screen === "home") {
    return (
      <Page>
        <section className={styles.startPanel}>
          <p className={styles.eyebrow}>Card game · 2–5 players</p>
          <h1>Red7</h1>
          <p className={styles.intro}>
            Be winning at the end of your turn. Change your Palette, change
            the rule, or do both.
          </p>
          <label className={styles.field}>
            <span>Your name</span>
            <input
              maxLength={30}
              value={displayName}
              onChange={(event) => setDisplayName(event.target.value)}
              placeholder="Ada"
            />
          </label>
          <div className={styles.startActions}>
            <div className={styles.actionCard}>
              <h2>Create</h2>
              <label className={styles.checkField}>
                <input
                  type="checkbox"
                  checked={drawRule}
                  onChange={(event) => setDrawRule(event.target.checked)}
                />
                <span>
                  Draw after a Canvas card whose value exceeds your Palette size
                </span>
              </label>
              <button type="button" disabled={busy} onClick={createRoom}>
                {busy ? "Creating..." : "Create game"}
              </button>
            </div>
            <div className={styles.actionCard}>
              <h2>Join</h2>
              <label className={styles.field}>
                <span>Room link or code</span>
                <input
                  value={joinCode}
                  onChange={(event) => setJoinCode(event.target.value)}
                  placeholder="Paste invite"
                />
              </label>
              <button type="button" disabled={busy} onClick={joinRoom}>
                Join game
              </button>
            </div>
          </div>
          {message ? <p className={styles.error}>{message}</p> : null}
        </section>
      </Page>
    );
  }

  if (screen === "join") {
    return (
      <Page>
        <section className={styles.startPanel}>
          <p className={styles.eyebrow}>You have been invited</p>
          <h1>Join Red7</h1>
          <label className={styles.field}>
            <span>Your name</span>
            <input
              autoFocus
              maxLength={30}
              value={displayName}
              onChange={(event) => setDisplayName(event.target.value)}
            />
          </label>
          <button type="button" disabled={busy} onClick={joinRoom}>
            {busy ? "Joining..." : "Take a seat"}
          </button>
          {message ? <p className={styles.error}>{message}</p> : null}
        </section>
      </Page>
    );
  }

  if (!state || !supabase || !user) {
    return null;
  }

  return (
    <Page>
      <RoomView
        state={state}
        userId={user.id}
        onlineUserIds={onlineUserIds}
        busy={busy}
        message={message}
        onStart={() =>
          runRoomRpc(() =>
            supabase.rpc("red7_start_round", {
              room_code: state.room.code,
            }),
          )
        }
        onKick={(playerId) =>
          runRoomRpc(() =>
            supabase.rpc("red7_kick_player", {
              room_code: state.room.code,
              target_player_id: playerId,
              expected_revision: state.room.revision,
            }),
          )
        }
        onPlay={(paletteCard, canvasCard) =>
          runRoomRpc(() =>
            supabase.rpc("red7_play_turn", {
              room_code: state.room.code,
              expected_revision: state.room.revision,
              palette_card: paletteCard,
              canvas_card: canvasCard,
            }),
          )
        }
        onGiveUp={() =>
          runRoomRpc(() =>
            supabase.rpc("red7_pass_turn", {
              room_code: state.room.code,
              expected_revision: state.room.revision,
            }),
          )
        }
        onLobby={() =>
          runRoomRpc(() =>
            supabase.rpc("red7_return_to_lobby", {
              room_code: state.room.code,
            }),
          )
        }
      />
    </Page>
  );
}

function RoomView({
  state,
  userId,
  onlineUserIds,
  busy,
  message,
  onStart,
  onKick,
  onPlay,
  onGiveUp,
  onLobby,
}: {
  state: Red7PublicState;
  userId: string;
  onlineUserIds: Set<string>;
  busy: boolean;
  message: string;
  onStart: () => void;
  onKick: (playerId: string) => void;
  onPlay: (paletteCard: Red7Card | null, canvasCard: Red7Card | null) => void;
  onGiveUp: () => void;
  onLobby: () => void;
}) {
  const [selectedCard, setSelectedCard] = useState<Red7Card | null>(null);
  const [paletteCard, setPaletteCard] = useState<Red7Card | null>(null);
  const [canvasCard, setCanvasCard] = useState<Red7Card | null>(null);
  const [copied, setCopied] = useState(false);
  const [interactionMessage, setInteractionMessage] = useState("");
  const [ruleAnimation, setRuleAnimation] = useState(0);
  const [visualRule, setVisualRule] = useState(state.room.canvasColor);
  const previousRule = useRef(state.room.canvasColor);
  const isHost = state.room.hostUserId === userId;
  const me = state.players.find(
    (player) => player.id === state.privateState.playerId,
  );
  const isMyTurn = state.round.currentPlayerId === me?.id;
  const activePlayers = state.players.filter(
    (player) =>
      player.role === "seated" && player.active && !player.eliminated,
  );
  const currentPlayer = state.players.find(
    (player) => player.id === state.round.currentPlayerId,
  );
  const winner = state.players.find(
    (player) => player.id === state.room.winnerPlayerId,
  );
  const currentWinnerId = winningPlayer(
    state.players,
    state.room.canvasColor,
  );
  const hasStagedMove = Boolean(paletteCard || canvasCard);
  const availableHand = state.privateState.cards.filter(
    (card) =>
      !(paletteCard && cardsEqual(paletteCard, card)) &&
      !(canvasCard && cardsEqual(canvasCard, card)),
  );

  useEffect(() => {
    setSelectedCard(null);
    setPaletteCard(null);
    setCanvasCard(null);
    setInteractionMessage("");
  }, [state.room.revision]);

  useEffect(() => {
    if (
      message.includes("does not leave you winning") ||
      message.includes("game changed")
    ) {
      setSelectedCard(null);
      setPaletteCard(null);
      setCanvasCard(null);
    }
  }, [message]);

  useEffect(() => {
    if (previousRule.current !== state.room.canvasColor) {
      previousRule.current = state.room.canvasColor;
      setRuleAnimation((current) => current + 1);
      const timer = window.setTimeout(
        () => setVisualRule(state.room.canvasColor),
        850,
      );
      return () => window.clearTimeout(timer);
    }
  }, [state.room.canvasColor]);

  async function copyInvite() {
    await navigator.clipboard.writeText(
      `${window.location.origin}${PLAY_PATH}/room/${state.room.code}`,
    );
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  }

  function selectHandCard(card: Red7Card) {
    if (busy) {
      return;
    }

    if (!isMyTurn) {
      setInteractionMessage(
        `Wait for ${currentPlayer?.displayName ?? "the current player"} to finish their turn.`,
      );
      return;
    }

    setInteractionMessage("");
    setSelectedCard((current) =>
      current && cardsEqual(current, card) ? null : card,
    );
  }

  function stageOnPalette() {
    if (!selectedCard || !isMyTurn || busy) {
      return;
    }

    setPaletteCard(selectedCard);
    setSelectedCard(null);
  }

  function stageOnCanvas() {
    if (!selectedCard || !isMyTurn || busy) {
      return;
    }

    setCanvasCard(selectedCard);
    setSelectedCard(null);
  }

  function returnStagedCard(card: Red7Card) {
    if (paletteCard && cardsEqual(paletteCard, card)) {
      setPaletteCard(null);
    }
    if (canvasCard && cardsEqual(canvasCard, card)) {
      setCanvasCard(null);
    }
    setSelectedCard(card);
  }

  function cancelMove() {
    setSelectedCard(null);
    setPaletteCard(null);
    setCanvasCard(null);
    setInteractionMessage("");
  }

  return (
    <section className={styles.room}>
      <div
        className={styles.ruleAtmosphere}
        data-color={visualRule}
        aria-hidden="true"
      />
      {ruleAnimation > 0 ? (
        <div
          key={ruleAnimation}
          className={styles.ruleChangePulse}
          data-color={state.room.canvasColor}
          aria-hidden="true"
        />
      ) : null}
      <header className={styles.roomHeader}>
        <div>
          <p className={styles.eyebrow}>
            Room {state.room.code.slice(0, 6)} · Round {state.round.roundNumber}
          </p>
          <h1>Red7</h1>
        </div>
        <div className={styles.headerActions}>
          <button type="button" className={styles.quietButton} onClick={copyInvite}>
            {copied ? "Copied" : "Copy invite"}
          </button>
          <a className={styles.quietLink} href={PLAY_PATH}>
            Leave
          </a>
        </div>
      </header>

      {state.room.status === "lobby" ? (
        <Lobby
          state={state}
          userId={userId}
          onlineUserIds={onlineUserIds}
          busy={busy}
          onStart={onStart}
          onKick={onKick}
        />
      ) : (
        <>
          <div className={styles.tableLayout}>
            <aside className={styles.roster}>
              <h2>Players</h2>
              {state.players
                .filter((player) => player.role === "seated")
                .map((player) => (
                  <PlayerRow
                    key={player.id}
                    player={player}
                    hostUserId={state.room.hostUserId}
                    currentPlayerId={state.round.currentPlayerId}
                    currentWinnerId={currentWinnerId}
                    isOnline={onlineUserIds.has(player.userId)}
                    canKick={isHost && player.userId !== userId}
                    onKick={onKick}
                  />
                ))}
              {state.players.some((player) => player.role === "spectator") ? (
                <>
                  <h3>Spectators</h3>
                  {state.players
                    .filter((player) => player.role === "spectator")
                    .map((player) => (
                      <PlayerRow
                        key={player.id}
                        player={player}
                        hostUserId={state.room.hostUserId}
                        currentPlayerId={null}
                        currentWinnerId={null}
                        isOnline={onlineUserIds.has(player.userId)}
                        canKick={isHost && player.userId !== userId}
                        onKick={onKick}
                      />
                    ))}
                </>
              ) : null}
            </aside>

            <div className={styles.playArea}>
              <section
                className={[
                  styles.canvasZone,
                  selectedCard && isMyTurn ? styles.availableDestination : "",
                ].join(" ")}
                data-color={canvasCard?.color ?? state.room.canvasColor}
                role={isMyTurn ? "button" : undefined}
                tabIndex={isMyTurn ? 0 : undefined}
                onClick={stageOnCanvas}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    stageOnCanvas();
                  }
                }}
              >
                <div className={styles.zoneHeading}>
                  <div>
                    <span>Shared Canvas</span>
                    <strong>
                      {canvasCard
                        ? `Change rule to ${ruleLabel(canvasCard.color)}`
                        : ruleLabel(state.room.canvasColor)}
                    </strong>
                  </div>
                  <small>
                    {canvasCard ? "Staged for this turn" : "Current rule"}
                  </small>
                </div>
                <div className={styles.canvasContents}>
                  <div
                    className={styles.ruleCard}
                    data-color={state.room.canvasColor}
                  >
                    <span>{state.room.canvasColor}</span>
                    <strong>{ruleLabel(state.room.canvasColor)}</strong>
                  </div>
                  {canvasCard ? (
                    <>
                      <span className={styles.stagedArrow}>→</span>
                      <Card
                        card={canvasCard}
                        compact
                        staged
                        onClick={() => returnStagedCard(canvasCard)}
                      />
                    </>
                  ) : (
                    <p>
                      {isMyTurn
                        ? selectedCard
                          ? "Click here to play the selected card to the Canvas."
                          : "Select a card from your hand to change the rule."
                        : "The Canvas sets the rule everyone must satisfy."}
                    </p>
                  )}
                </div>
              </section>

              <div className={styles.palettes}>
                {state.players
                  .filter((player) => player.role === "seated")
                  .map((player) => (
                    <section
                      key={player.id}
                      className={[
                        styles.palette,
                        player.id === currentWinnerId ? styles.winningPalette : "",
                        player.eliminated ? styles.eliminatedPalette : "",
                        player.id === me?.id && selectedCard && isMyTurn
                          ? styles.availableDestination
                          : "",
                      ].join(" ")}
                      role={player.id === me?.id && isMyTurn ? "button" : undefined}
                      tabIndex={player.id === me?.id && isMyTurn ? 0 : undefined}
                      onClick={
                        player.id === me?.id && isMyTurn
                          ? stageOnPalette
                          : undefined
                      }
                      onKeyDown={(event) => {
                        if (
                          player.id === me?.id &&
                          isMyTurn &&
                          (event.key === "Enter" || event.key === " ")
                        ) {
                          stageOnPalette();
                        }
                      }}
                    >
                      <div className={styles.paletteHeading}>
                        <span>Palette</span>
                        <h3>
                          {player.displayName}
                          {player.id === me?.id ? " (you)" : ""}
                        </h3>
                      </div>
                      <div className={styles.cardRow}>
                        {player.palette.map((card) => (
                          <Card key={cardKey(card)} card={card} compact />
                        ))}
                        {player.id === me?.id && paletteCard ? (
                          <Card
                            card={paletteCard}
                            compact
                            staged
                            onClick={() => returnStagedCard(paletteCard)}
                          />
                        ) : null}
                        {player.palette.length === 0 &&
                        !(player.id === me?.id && paletteCard) ? (
                          <span className={styles.emptyPalette}>Empty</span>
                        ) : null}
                      </div>
                      {player.id === me?.id && selectedCard && !paletteCard ? (
                        <p className={styles.destinationHint}>
                          Click here to add the selected card to your Palette.
                        </p>
                      ) : null}
                    </section>
                  ))}
              </div>

              {state.room.status === "finished" ? (
                <section className={styles.winnerPanel}>
                  <p className={styles.eyebrow}>Round complete</p>
                  <h2>{winner?.displayName ?? "A player"} wins</h2>
                  {isHost ? (
                    <button type="button" disabled={busy} onClick={onLobby}>
                      Return to lobby
                    </button>
                  ) : (
                    <p>Waiting for the host to set up the next round.</p>
                  )}
                </section>
              ) : me?.role === "spectator" ? (
                <section className={styles.turnPanel}>
                  <h2>Watching this round</h2>
                  <p>You will be eligible for a seat when the next round starts.</p>
                </section>
              ) : (
                <section className={styles.turnPanel}>
                  <div className={styles.turnHeading}>
                    <div>
                      <p className={styles.eyebrow}>
                        {isMyTurn ? "Your turn" : "Current turn"}
                      </p>
                      <h2>
                        {isMyTurn
                          ? "Choose your play"
                          : currentPlayer?.displayName ?? "Waiting"}
                      </h2>
                    </div>
                    <span>{state.round.deckCount} cards in deck</span>
                  </div>

                  {currentPlayer &&
                  !onlineUserIds.has(currentPlayer.userId) &&
                  !isMyTurn ? (
                    <p className={styles.notice}>
                      Play is paused while {currentPlayer.displayName} reconnects.
                    </p>
                  ) : null}

                  <div className={styles.handLabel}>
                    <strong>Your hand</strong>
                    <span>
                      {isMyTurn
                        ? selectedCard
                          ? "Now click your Palette or the shared Canvas."
                          : "Click a card to select it."
                        : "Your cards stay private."}
                    </span>
                  </div>
                  {!isMyTurn ? (
                    <p className={styles.waitingBanner}>
                      Waiting for {currentPlayer?.displayName ?? "the current player"}.
                      Your cards unlock when your turn begins.
                    </p>
                  ) : null}
                  <div className={styles.hand}>
                    {availableHand.map((card) => (
                      <Card
                        key={cardKey(card)}
                        card={card}
                        selected={
                          Boolean(selectedCard) &&
                          cardsEqual(selectedCard as Red7Card, card)
                        }
                        disabled={busy}
                        muted={!isMyTurn}
                        onClick={() => selectHandCard(card)}
                      />
                    ))}
                  </div>
                  {interactionMessage ? (
                    <p className={styles.interactionMessage}>{interactionMessage}</p>
                  ) : null}

                  {isMyTurn ? (
                    <div className={styles.moveBar}>
                      <div>
                        <strong>
                          {hasStagedMove
                            ? "Review your staged move"
                            : "Select a card, then choose its destination"}
                        </strong>
                        {state.room.drawRule ? (
                          <span>
                            Canvas cards draw when their value exceeds your final
                            Palette size.
                          </span>
                        ) : null}
                      </div>
                      <button
                        type="button"
                        className={styles.cancelButton}
                        disabled={!selectedCard && !hasStagedMove}
                        onClick={cancelMove}
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        disabled={!hasStagedMove || busy}
                        onClick={() => onPlay(paletteCard, canvasCard)}
                      >
                        End turn
                      </button>
                      <button
                        type="button"
                        className={styles.dangerButton}
                        disabled={busy}
                        onClick={() => {
                          if (window.confirm("Give up and leave this round?")) {
                            onGiveUp();
                          }
                        }}
                      >
                        Give up
                      </button>
                    </div>
                  ) : null}
                </section>
              )}
            </div>
          </div>
        </>
      )}

      {message ? <p className={styles.error}>{message}</p> : null}
      <footer className={styles.roomFooter}>
        <span>Red7: be winning at the end of your turn.</span>
        <span>{activePlayers.length} active</span>
      </footer>
    </section>
  );
}

function Lobby({
  state,
  userId,
  onlineUserIds,
  busy,
  onStart,
  onKick,
}: {
  state: Red7PublicState;
  userId: string;
  onlineUserIds: Set<string>;
  busy: boolean;
  onStart: () => void;
  onKick: (playerId: string) => void;
}) {
  const isHost = state.room.hostUserId === userId;
  const connectedCount = state.players.filter((player) =>
    onlineUserIds.has(player.userId),
  ).length;

  return (
    <div className={styles.lobby}>
      <div>
        <p className={styles.eyebrow}>Lobby</p>
        <h2>Waiting at the table</h2>
        <p>
          Share the invite link. The first five connected players will be seated
          when the host starts.
        </p>
        <div className={styles.settings}>
          <span>Players: {connectedCount}/5</span>
          <span>Canvas draw: {state.room.drawRule ? "On" : "Off"}</span>
        </div>
      </div>
      <div className={styles.lobbyRoster}>
        {state.players.map((player) => (
          <PlayerRow
            key={player.id}
            player={player}
            hostUserId={state.room.hostUserId}
            currentPlayerId={null}
            currentWinnerId={null}
            isOnline={onlineUserIds.has(player.userId)}
            canKick={isHost && player.userId !== userId}
            onKick={onKick}
          />
        ))}
      </div>
      {isHost ? (
        <button
          type="button"
          disabled={busy || connectedCount < 2}
          onClick={onStart}
        >
          {connectedCount < 2 ? "Waiting for another player" : "Start round"}
        </button>
      ) : (
        <p className={styles.notice}>Waiting for the host to start the round.</p>
      )}
    </div>
  );
}

function PlayerRow({
  player,
  hostUserId,
  currentPlayerId,
  currentWinnerId,
  isOnline,
  canKick,
  onKick,
}: {
  player: Red7Player;
  hostUserId: string;
  currentPlayerId: string | null;
  currentWinnerId: string | null;
  isOnline: boolean;
  canKick: boolean;
  onKick: (playerId: string) => void;
}) {
  return (
    <div className={styles.playerRow}>
      <span
        className={isOnline ? styles.onlineDot : styles.offlineDot}
        aria-label={isOnline ? "Online" : "Offline"}
      />
      <div>
        <strong>{player.displayName}</strong>
        <small>
          {player.handCount} card{player.handCount === 1 ? "" : "s"} ·{" "}
          {player.userId === hostUserId ? "Host · " : ""}
          {player.id === currentPlayerId ? "Playing · " : ""}
          {player.id === currentWinnerId ? "Winning · " : ""}
          {player.eliminated ? "Eliminated" : isOnline ? "Online" : "Reconnecting"}
        </small>
      </div>
      {canKick ? (
        <button
          type="button"
          className={styles.kickButton}
          onClick={() => onKick(player.id)}
        >
          Remove
        </button>
      ) : null}
    </div>
  );
}

function Card({
  card,
  compact = false,
  selected = false,
  staged = false,
  disabled = false,
  muted = false,
  onClick,
}: {
  card: Red7Card;
  compact?: boolean;
  selected?: boolean;
  staged?: boolean;
  disabled?: boolean;
  muted?: boolean;
  onClick?: () => void;
}) {
  return (
    <div
      className={[
        styles.card,
        compact ? styles.compactCard : "",
        selected ? styles.selectedCard : "",
        staged ? styles.stagedCard : "",
        disabled ? styles.disabledCard : "",
        muted ? styles.mutedCard : "",
        onClick ? styles.clickableCard : "",
      ].join(" ")}
      data-color={card.color}
      aria-label={`${card.color} ${card.value}`}
      role={onClick ? "button" : undefined}
      tabIndex={onClick && !disabled ? 0 : undefined}
      onClick={(event) => {
        event.stopPropagation();
        if (!disabled) {
          onClick?.();
        }
      }}
      onKeyDown={(event) => {
        if (
          !disabled &&
          onClick &&
          (event.key === "Enter" || event.key === " ")
        ) {
          event.preventDefault();
          onClick();
        }
      }}
    >
      <span>{card.value}</span>
      <small className={styles.cardRule}>{ruleLabel(card.color)}</small>
      <strong>{card.color.slice(0, 1).toUpperCase()}</strong>
    </div>
  );
}

function Page({ children }: { children: React.ReactNode }) {
  return (
    <main className={styles.page}>
      <a className={styles.homeLink} href="/">
        TOOMUCHMATHS
      </a>
      {children}
    </main>
  );
}

function StatusPanel({
  title,
  message,
  children,
}: {
  title: string;
  message: string;
  children?: React.ReactNode;
}) {
  return (
    <section className={styles.statusPanel}>
      <h1>{title}</h1>
      <p>{message}</p>
      {children}
    </section>
  );
}

function cardKey(card: Red7Card) {
  return `${card.color}-${card.value}`;
}

function extractRoomCode(value: string) {
  const clean = value.trim().toLowerCase();
  const match = clean.match(/\/room\/([a-z0-9]{20})/);
  return match?.[1] ?? (/^[a-z0-9]{20}$/.test(clean) ? clean : "");
}

function readableError(message: string) {
  return message
    .replace(/^.*?error:\s*/i, "")
    .replace(/\.$/, "")
    .concat(".");
}
