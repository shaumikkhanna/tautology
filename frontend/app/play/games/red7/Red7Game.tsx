"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { RealtimeChannel, User } from "@supabase/supabase-js";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import {
  cardsEqual,
  ruleLabel,
  winningPlayer,
} from "./red7Engine";
import {
  getAdvancedTurnState,
  roomAdvancedRules,
  type PendingAdvancedEffect,
} from "./red7Advanced";
import type {
  Red7AdvancedEffect,
  Red7AdvancedRules,
  Red7Card,
  Red7PalettePlay,
  Red7Player,
  Red7PublicState,
  Red7TurnReplay,
  Red7TurnReplayStep,
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
      enable_draw_rule: true,
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

    const code = roomCode;
    if (!code) {
      setMessage("Open Red7 from a valid invite link.");
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
        <section className={`${styles.startPanel} ${styles.homePanel}`}>
          <div className={styles.colorFan} aria-hidden="true">
            {["red", "orange", "yellow", "green", "blue", "indigo", "violet"].map(
              (color) => (
                <span key={color} data-color={color} />
              ),
            )}
          </div>
          <h1>Red7</h1>
          <p className={styles.intro}>Be winning at the end of your turn.</p>
          <label className={styles.field}>
            <span>Your name</span>
            <input
              maxLength={30}
              value={displayName}
              onChange={(event) => setDisplayName(event.target.value)}
              placeholder="Ada"
            />
          </label>
          <button
            type="button"
            className={styles.primaryAction}
            disabled={busy}
            onClick={createRoom}
          >
            {busy ? "Creating..." : "Create game"}
          </button>
          {message ? <p className={styles.error}>{message}</p> : null}
        </section>
      </Page>
    );
  }

  if (screen === "join") {
    return (
      <Page>
        <section className={`${styles.startPanel} ${styles.joinPanel}`}>
          <div className={styles.inviteMark} aria-hidden="true">7</div>
          <p className={styles.eyebrow}>You have been invited</p>
          <h1>Join Red7</h1>
          <p className={styles.intro}>Choose your name and take your place at the table.</p>
          <label className={styles.field}>
            <span>Your name</span>
            <input
              autoFocus
              maxLength={30}
              value={displayName}
              onChange={(event) => setDisplayName(event.target.value)}
            />
          </label>
          <button
            type="button"
            className={styles.primaryAction}
            disabled={busy}
            onClick={joinRoom}
          >
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
        onDrawRuleChange={(enabled) =>
          runRoomRpc(() =>
            supabase.rpc("red7_set_draw_rule", {
              room_code: state.room.code,
              enabled,
            }),
          )
        }
        onAdvancedRulesChange={(rules) =>
          runRoomRpc(() =>
            supabase.rpc("red7_set_advanced_rules", {
              room_code: state.room.code,
              enable_seven: rules.seven,
              enable_five: rules.five,
              enable_three: rules.three,
              enable_one: rules.one,
            }),
          )
        }
        onPlay={(palettePlays, canvasCard) =>
          runRoomRpc(() =>
            supabase.rpc("red7_play_turn", {
              room_code: state.room.code,
              expected_revision: state.room.revision,
              palette_plays: palettePlays,
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
  onDrawRuleChange,
  onAdvancedRulesChange,
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
  onDrawRuleChange: (enabled: boolean) => void;
  onAdvancedRulesChange: (rules: Red7AdvancedRules) => void;
  onPlay: (palettePlays: Red7PalettePlay[], canvasCard: Red7Card | null) => void;
  onGiveUp: () => void;
  onLobby: () => void;
}) {
  const [storedPalettePlays, setPalettePlays] = useState<Red7PalettePlay[]>([]);
  const [storedCanvasCard, setCanvasCard] = useState<Red7Card | null>(null);
  const [draftRevision, setDraftRevision] = useState(state.room.revision);
  const [draggedCard, setDraggedCard] = useState<Red7Card | null>(null);
  const [dragPosition, setDragPosition] = useState<{ x: number; y: number } | null>(null);
  const [copied, setCopied] = useState(false);
  const [turnReplay, setTurnReplay] = useState<{
    replay: Red7TurnReplay;
    stepIndex: number;
  } | null>(null);
  const [ruleAnimation, setRuleAnimation] = useState(0);
  const [visualRule, setVisualRule] = useState(state.room.canvasColor);
  const previousRule = useRef(state.room.canvasColor);
  const previousReplayId = useRef(state.room.lastTurn?.id ?? null);
  const draftIsCurrent = draftRevision === state.room.revision;
  const palettePlays = draftIsCurrent ? storedPalettePlays : [];
  const canvasCard = draftIsCurrent ? storedCanvasCard : null;
  const isHost = state.room.hostUserId === userId;
  const me = state.players.find(
    (player) => player.id === state.privateState.playerId,
  );
  const isMyTurn = state.round.currentPlayerId === me?.id;
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
  const advancedTurn = getAdvancedTurnState(
    state,
    me?.id ?? null,
    palettePlays,
  );
  const hasStagedMove = Boolean(palettePlays.length || canvasCard);
  const unresolvedEffect = advancedTurn.pending;
  const stagedPaletteCards = palettePlays.map((play) => play.card);
  const stagedCanvasCards = palettePlays
    .filter(
      (play) => play.effect?.type === "seven" && play.effect.destination === "canvas",
    )
    .map((play) => play.effect!.card)
    .concat(canvasCard ? [canvasCard] : []);
  const draggedCardIsStaged = Boolean(
    draggedCard &&
      (stagedPaletteCards.some((card) => cardsEqual(card, draggedCard)) ||
        (canvasCard && cardsEqual(canvasCard, draggedCard))),
  );
  const availableHand = state.privateState.cards.filter(
    (card) =>
      !stagedPaletteCards.some((played) => cardsEqual(played, card)) &&
      !(canvasCard && cardsEqual(canvasCard, card)),
  );
  const seatedPlayers = state.players.filter(
    (player) => player.role === "seated",
  );
  const otherPlayers = seatedPlayers.filter((player) => player.id !== me?.id);
  const spectators = state.players.filter(
    (player) => player.role === "spectator",
  );

  useEffect(() => {
    setPalettePlays([]);
    setCanvasCard(null);
    setDraftRevision(state.room.revision);
    setDraggedCard(null);
    setDragPosition(null);
  }, [state.room.revision]);

  useEffect(() => {
    if (
      message.includes("does not leave you winning") ||
      message.includes("game changed")
    ) {
      setPalettePlays([]);
      setCanvasCard(null);
      setDraggedCard(null);
      setDragPosition(null);
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

  useEffect(() => {
    const replay = state.room.lastTurn;
    if (!replay || replay.id === previousReplayId.current) return;

    previousReplayId.current = replay.id;
    if (replay.actorPlayerId !== me?.id && replay.steps.length > 0) {
      setTurnReplay({ replay, stepIndex: 0 });
    }
  }, [me?.id, state.room.lastTurn]);

  useEffect(() => {
    if (!turnReplay) return;

    const timer = window.setTimeout(() => {
      if (turnReplay.stepIndex + 1 < turnReplay.replay.steps.length) {
        setTurnReplay({
          replay: turnReplay.replay,
          stepIndex: turnReplay.stepIndex + 1,
        });
      } else {
        setTurnReplay(null);
      }
    }, 2400);
    return () => window.clearTimeout(timer);
  }, [turnReplay]);

  async function copyInvite() {
    await navigator.clipboard.writeText(
      `${window.location.origin}${PLAY_PATH}/room/${state.room.code}`,
    );
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  }

  function stageCard(
    card: Red7Card,
    destination: "hand" | "palette" | "canvas",
  ) {
    if (!isMyTurn || busy) {
      return;
    }

    if (destination === "hand") {
      returnStagedCard(card);
    } else if (destination === "palette") {
      if (unresolvedEffect?.type === "five") {
        setPalettePlays((current) => [...current, { card }]);
      } else {
        setPalettePlays([{ card }]);
      }
      if (canvasCard && cardsEqual(canvasCard, card)) {
        setCanvasCard(null);
      }
    } else {
      setCanvasCard(card);
      const playedIndex = palettePlays.findIndex((play) =>
        cardsEqual(play.card, card),
      );
      if (playedIndex >= 0) {
        setPalettePlays(palettePlays.slice(0, playedIndex));
      }
    }
  }

  function returnStagedCard(card: Red7Card) {
    const playedIndex = palettePlays.findIndex((play) =>
      cardsEqual(play.card, card),
    );
    if (playedIndex >= 0) {
      setPalettePlays(palettePlays.slice(0, playedIndex));
    }
    if (canvasCard && cardsEqual(canvasCard, card)) {
      setCanvasCard(null);
    }
  }

  function cancelMove() {
    setPalettePlays([]);
    setCanvasCard(null);
    setDraggedCard(null);
    setDragPosition(null);
  }

  function beginDrag(card: Red7Card) {
    if (!isMyTurn || busy) {
      return false;
    }
    setDraggedCard(card);
    return true;
  }

  function finishPointerDrag(x: number, y: number) {
    const destination = document
      .elementFromPoint(x, y)
      ?.closest<HTMLElement>("[data-red7-drop]")
      ?.dataset.red7Drop;

    if (
      draggedCard &&
      (destination === "hand" ||
        destination === "palette" ||
        destination === "canvas")
    ) {
      stageCard(draggedCard, destination);
    }
    setDraggedCard(null);
    setDragPosition(null);
  }

  function draggableCardProps(card: Red7Card) {
    return {
      draggable: isMyTurn && !busy,
      onPointerDragStart: (x: number, y: number) => {
        if (beginDrag(card)) setDragPosition({ x, y });
      },
      onPointerDragMove: (x: number, y: number) => setDragPosition({ x, y }),
      onPointerDragEnd: finishPointerDrag,
      onPointerDragCancel: () => {
        setDraggedCard(null);
        setDragPosition(null);
      },
    };
  }

  return (
    <section className={styles.room}>
      <div
        className={[
          styles.ruleAtmosphere,
          state.room.status !== "playing" ? styles.neutralAtmosphere : "",
        ].join(" ")}
        data-color={visualRule}
        aria-hidden="true"
      />
      {ruleAnimation > 0 && state.room.status === "playing" ? (
        <div
          key={ruleAnimation}
          className={styles.ruleChangePulse}
          data-color={state.room.canvasColor}
          aria-hidden="true"
        />
      ) : null}
      <aside className={styles.roomControls} aria-label="Room controls">
        <span>Room {state.room.code.slice(0, 6)}</span>
        <span>Round {state.round.roundNumber}</span>
        <button type="button" className={styles.quietButton} onClick={copyInvite}>
          {copied ? "Copied" : "Invite"}
        </button>
        <a className={styles.quietLink} href={PLAY_PATH}>Leave</a>
      </aside>

      {state.room.status === "lobby" ? (
        <Lobby
          state={state}
          userId={userId}
          onlineUserIds={onlineUserIds}
          busy={busy}
          onStart={onStart}
          onKick={onKick}
          onDrawRuleChange={onDrawRuleChange}
          onAdvancedRulesChange={onAdvancedRulesChange}
        />
      ) : (
        <>
          <div className={styles.tableLayout}>
            <div className={styles.playArea}>
              <div className={styles.opponentPalettes}>
                {otherPlayers.map((player) => (
                  <PlayerPalette
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
              </div>

              {spectators.length > 0 ? (
                <div className={styles.spectatorBar}>
                  <span>Spectators</span>
                  {spectators.map((player) => (
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
              ) : null}

              <section
                className={[
                  styles.canvasZone,
                  draggedCard && isMyTurn ? styles.availableDestination : "",
                ].join(" ")}
                data-color={canvasCard?.color ?? state.room.canvasColor}
                data-red7-drop="canvas"
              >
                <div className={styles.zoneHeading}>
                  <span>Shared Canvas</span>
                </div>
                <div className={styles.canvasContents}>
                  <div
                    className={styles.ruleCard}
                    data-color={state.room.canvasColor}
                  >
                    <span>{state.room.canvasColor}</span>
                    <strong>{ruleLabel(state.room.canvasColor)}</strong>
                  </div>
                  {stagedCanvasCards.length > 0 ? (
                    <>
                      <span className={styles.stagedArrow}>→</span>
                      {stagedCanvasCards.map((card, index) => (
                        <Card
                          key={`${cardKey(card)}-${index}`}
                          card={card}
                          compact
                          staged
                          onClick={
                            index === stagedCanvasCards.length - 1 && canvasCard
                              ? () => returnStagedCard(canvasCard)
                              : undefined
                          }
                          {...(
                            index === stagedCanvasCards.length - 1 && canvasCard
                              ? draggableCardProps(canvasCard)
                              : {}
                          )}
                        />
                      ))}
                    </>
                  ) : null}
                </div>
                <p className={styles.canvasHint}>
                  {stagedCanvasCards.length
                    ? `${stagedCanvasCards.length} rule change${stagedCanvasCards.length === 1 ? "" : "s"} staged for this turn.`
                    : "Drop a card here to change the rule."}
                </p>
              </section>

              {me?.role === "seated" ? (
                <div className={styles.myPaletteWrap}>
                    <section
                      className={[
                        styles.palette,
                        me.id === currentWinnerId ? styles.winningPalette : "",
                        me.eliminated ? styles.eliminatedPalette : "",
                        draggedCard && isMyTurn ? styles.availableDestination : "",
                      ].join(" ")}
                      data-red7-drop="palette"
                    >
                      <div className={styles.paletteHeading}>
                        <span>Your Palette</span>
                        <h3>
                          {me.displayName} · {me.handCount} card
                          {me.handCount === 1 ? "" : "s"} ·{" "}
                          {onlineUserIds.has(me.userId) ? "Online" : "Reconnecting"}
                        </h3>
                      </div>
                      <div className={styles.cardRow}>
                        {advancedTurn.palette.map((card) => {
                          const isStaged = stagedPaletteCards.some((item) =>
                            cardsEqual(item, card),
                          );
                          return (
                            <Card
                              key={cardKey(card)}
                              card={card}
                              compact
                              staged={isStaged}
                              onClick={isStaged ? () => returnStagedCard(card) : undefined}
                              {...(isStaged ? draggableCardProps(card) : {})}
                            />
                          );
                        })}
                        {advancedTurn.palette.length === 0 ? (
                          <span className={styles.emptyPalette}>Empty</span>
                        ) : null}
                      </div>
                    </section>
                </div>
              ) : null}

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
                <>
                  <section className={styles.turnPanel}>
                    <div className={styles.turnHeading}>
                      <div>
                        <p className={styles.eyebrow}>
                          {isMyTurn ? "Your turn" : "Current turn"}
                        </p>
                        {!isMyTurn ? (
                          <h2>{currentPlayer?.displayName ?? "Waiting"}</h2>
                        ) : null}
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
                      <strong>Hand</strong>
                    </div>
                    <div
                      className={[
                        styles.hand,
                        draggedCardIsStaged ? styles.availableHandDestination : "",
                      ].join(" ")}
                      data-red7-drop="hand"
                    >
                      {availableHand.map((card) => (
                        <Card
                          key={cardKey(card)}
                          card={card}
                          disabled={busy}
                          muted={!isMyTurn}
                          {...draggableCardProps(card)}
                        />
                      ))}
                    </div>
                  </section>
                  {isMyTurn ? (
                    <div className={`${styles.moveBar} ${unresolvedEffect ? styles.resolvingMoveBar : ""}`}>
                      <div>
                        <strong>
                          {unresolvedEffect
                            ? advancedPrompt(unresolvedEffect)
                            : hasStagedMove
                            ? "Move ready"
                            : "Drag a card to your Palette or Canvas"}
                        </strong>
                        {unresolvedEffect?.type === "seven" ? (
                          <AdvancedSevenChoice
                            cards={unresolvedEffect.cards}
                            onChoose={(card, destination) =>
                              setPalettePlayEffect(
                                setPalettePlays,
                                unresolvedEffect.playIndex,
                                { type: "seven", card, destination },
                              )
                            }
                          />
                        ) : unresolvedEffect?.type === "five" ? (
                          <div className={styles.effectCards}>
                            {unresolvedEffect.cards.map((card) => (
                              <Card
                                key={cardKey(card)}
                                card={card}
                                compact
                                onClick={() => {
                                  setPalettePlays((current) => [...current, { card }]);
                                  if (canvasCard && cardsEqual(canvasCard, card)) {
                                    setCanvasCard(null);
                                  }
                                }}
                              />
                            ))}
                          </div>
                        ) : unresolvedEffect?.type === "one" ? (
                          <AdvancedOneChoice
                            targets={unresolvedEffect.targets}
                            onChoose={(playerId, card) =>
                              setPalettePlayEffect(
                                setPalettePlays,
                                unresolvedEffect.playIndex,
                                { type: "one", playerId, card },
                              )
                            }
                          />
                        ) : state.room.drawRule ? (
                          <span>
                            The optional draw checks the last Canvas card after all
                            advanced effects.
                          </span>
                        ) : null}
                      </div>
                      <button
                        type="button"
                        className={styles.cancelButton}
                        disabled={!hasStagedMove}
                        onClick={cancelMove}
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        disabled={!hasStagedMove || Boolean(unresolvedEffect) || busy}
                        onClick={() => onPlay(palettePlays, canvasCard)}
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
                  ) : (
                    <div className={`${styles.moveBar} ${styles.statusMoveBar}`}>
                      <div>
                        <strong>{currentPlayer?.displayName ?? "Waiting"}&apos;s turn</strong>
                        <span>Your hand will unlock when play reaches you.</span>
                      </div>
                    </div>
                  )}
                </>
              )}
              <GameLog events={state.gameLog ?? []} players={state.players} />
            </div>
          </div>
        </>
      )}

      {message ? <p className={styles.error}>{message}</p> : null}
      {turnReplay ? (
        <TurnReplayOverlay
          replay={turnReplay.replay}
          stepIndex={turnReplay.stepIndex}
          players={state.players}
        />
      ) : null}
      {draggedCard && dragPosition ? (
        <div
          className={styles.dragPreview}
          style={{ left: dragPosition.x, top: dragPosition.y }}
          aria-hidden="true"
        >
          <Card card={draggedCard} compact />
        </div>
      ) : null}
    </section>
  );
}

function TurnReplayOverlay({
  replay,
  stepIndex,
  players,
}: {
  replay: Red7TurnReplay;
  stepIndex: number;
  players: Red7Player[];
}) {
  const actor = players.find((player) => player.id === replay.actorPlayerId);
  const step = replay.steps[stepIndex];
  const actorName = replay.actorName ?? actor?.displayName ?? "The previous player";
  const sourceName =
    step.type === "deck"
      ? players.find((player) => player.id === step.fromPlayerId)?.displayName ?? null
      : null;
  const locations = replayLocations(step, actorName, sourceName);

  return (
    <section className={styles.turnReplay} aria-live="polite" aria-label="Turn replay">
      <header>
        <strong>{actorName}&apos;s turn</strong>
        <span>{stepIndex + 1} / {replay.steps.length}</span>
      </header>
      <div key={`${replay.id}-${stepIndex}`} className={styles.replayStage}>
        <span>{locations.from}</span>
        <div className={styles.replayMovingCard}>
          {step.type === "draw" ? (
            <div className={styles.replayCardBack} aria-label="Face-down card">7</div>
          ) : (
            <Card card={step.card} compact />
          )}
        </div>
        <b aria-hidden="true">→</b>
        <span>{locations.to}</span>
      </div>
      <p>{replayDescription(step, actorName, sourceName)}</p>
      <div className={styles.replayProgress} aria-hidden="true">
        {replay.steps.map((_, index) => (
          <i key={index} data-active={index <= stepIndex} />
        ))}
      </div>
    </section>
  );
}

function GameLog({
  events,
  players,
}: {
  events: Red7TurnReplay[];
  players: Red7Player[];
}) {
  const entriesRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (entriesRef.current) {
      entriesRef.current.scrollTop = 0;
    }
  }, [events.length]);

  return (
    <section className={styles.gameLog} aria-label="Game log">
      <header>
        <h2>Game log</h2>
        <span>This round</span>
      </header>
      <div ref={entriesRef} className={styles.gameLogEntries}>
        {events.length === 0 ? (
          <p className={styles.emptyGameLog}>No completed turns yet.</p>
        ) : (
          [...events].reverse().map((event, reverseIndex) => {
            const actor = players.find(
              (player) => player.id === event.actorPlayerId,
            );
            const actorName = event.actorName ?? actor?.displayName ?? "Player";
            const turnNumber = events.length - reverseIndex;
            return (
              <article key={event.id} className={styles.gameLogTurn}>
                <h3>
                  <span>{actorName}</span>
                  <small>Turn {turnNumber}</small>
                </h3>
                <ol>
                  {event.steps.map((step, stepIndex) => {
                    const sourceName =
                      step.type === "deck"
                        ? event.playerNames?.[step.fromPlayerId] ??
                          players.find(
                            (player) => player.id === step.fromPlayerId,
                          )?.displayName ??
                          null
                        : null;
                    return (
                      <li key={`${event.id}-${stepIndex}`}>
                        {replayDescription(step, actorName, sourceName)}
                      </li>
                    );
                  })}
                </ol>
              </article>
            );
          })
        )}
      </div>
    </section>
  );
}

function replayLocations(
  step: Red7TurnReplayStep,
  actorName: string,
  sourceName: string | null,
) {
  if (step.type === "palette") return { from: "Hand", to: `${actorName}'s Palette` };
  if (step.type === "canvas") {
    return { from: step.source === "seven" ? "Palette" : "Hand", to: "Canvas" };
  }
  if (step.type === "deck") {
    return { from: `${sourceName ?? actorName}'s Palette`, to: "Draw Deck" };
  }
  return { from: "Draw Deck", to: `${actorName}'s Hand` };
}

function replayDescription(
  step: Red7TurnReplayStep,
  actorName: string,
  sourceName: string | null,
) {
  if (step.type === "palette") {
    return step.source === "five"
      ? `5 effect: ${actorName} played ${cardLabel(step.card)} to their Palette.`
      : `${actorName} played ${cardLabel(step.card)} to their Palette.`;
  }
  if (step.type === "canvas") {
    return step.source === "seven"
      ? `7 effect: ${actorName} moved ${cardLabel(step.card)} from their Palette to the Canvas.`
      : `${actorName} played ${cardLabel(step.card)} to the Canvas, changing the rule to ${step.card.color}.`;
  }
  if (step.type === "deck") {
    return step.source === "one"
      ? `1 effect: ${actorName} took ${cardLabel(step.card)} from ${sourceName ?? "another player"}'s Palette and placed it on the Draw Deck.`
      : `7 effect: ${actorName} placed ${cardLabel(step.card)} from their Palette on the Draw Deck.`;
  }
  return step.source === "three"
    ? `3 effect: ${actorName} drew a card.`
    : `Optional draw: ${actorName} drew a card after changing the rule.`;
}

function cardLabel(card: Red7Card) {
  return `${card.color.slice(0, 1).toUpperCase()}${card.color.slice(1)} ${card.value}`;
}

function setPalettePlayEffect(
  setPlays: React.Dispatch<React.SetStateAction<Red7PalettePlay[]>>,
  playIndex: number,
  effect: Red7AdvancedEffect,
) {
  setPlays((current) =>
    current.map((play, index) => (index === playIndex ? { ...play, effect } : play)),
  );
}

function advancedPrompt(effect: PendingAdvancedEffect) {
  if (effect.type === "seven") return "7: move one of your Palette cards";
  if (effect.type === "five") return "5: play another card to your Palette";
  return "1: return an opponent Palette card to the Draw Deck";
}

function AdvancedSevenChoice({
  cards,
  onChoose,
}: {
  cards: Red7Card[];
  onChoose: (card: Red7Card, destination: "canvas" | "deck") => void;
}) {
  return (
    <div className={styles.effectChoices}>
      {cards.map((card) => (
        <div key={cardKey(card)} className={styles.effectChoice}>
          <Card card={card} compact />
          <button type="button" onClick={() => onChoose(card, "canvas")}>Canvas</button>
          <button type="button" onClick={() => onChoose(card, "deck")}>Draw Deck</button>
        </div>
      ))}
    </div>
  );
}

function AdvancedOneChoice({
  targets,
  onChoose,
}: {
  targets: Array<{ player: Red7Player; cards: Red7Card[] }>;
  onChoose: (playerId: string, card: Red7Card) => void;
}) {
  return (
    <div className={styles.stealChoices}>
      {targets.map(({ player, cards }) => (
        <div key={player.id}>
          <span>{player.displayName}</span>
          <div className={styles.effectCards}>
            {cards.map((card) => (
              <Card
                key={cardKey(card)}
                card={card}
                compact
                onClick={() => onChoose(player.id, card)}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function Lobby({
  state,
  userId,
  onlineUserIds,
  busy,
  onStart,
  onKick,
  onDrawRuleChange,
  onAdvancedRulesChange,
}: {
  state: Red7PublicState;
  userId: string;
  onlineUserIds: Set<string>;
  busy: boolean;
  onStart: () => void;
  onKick: (playerId: string) => void;
  onDrawRuleChange: (enabled: boolean) => void;
  onAdvancedRulesChange: (rules: Red7AdvancedRules) => void;
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
        </div>
        <label className={styles.lobbyRule}>
          <input
            type="checkbox"
            checked={state.room.drawRule}
            disabled={!isHost || busy}
            onChange={(event) => onDrawRuleChange(event.target.checked)}
          />
          <span>Use the optional Canvas draw rule</span>
        </label>
        <AdvancedRulesSettings
          rules={roomAdvancedRules(state)}
          disabled={!isHost || busy}
          onChange={onAdvancedRulesChange}
        />
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

function AdvancedRulesSettings({
  rules,
  disabled,
  onChange,
}: {
  rules: Red7AdvancedRules;
  disabled: boolean;
  onChange: (rules: Red7AdvancedRules) => void;
}) {
  const parentRef = useRef<HTMLInputElement>(null);
  const values = Object.values(rules);
  const allEnabled = values.every(Boolean);
  const someEnabled = values.some(Boolean);

  useEffect(() => {
    if (parentRef.current) {
      parentRef.current.indeterminate = someEnabled && !allEnabled;
    }
  }, [allEnabled, someEnabled]);

  const options: Array<{
    key: keyof Red7AdvancedRules;
    number: number;
    label: string;
  }> = [
    { key: "seven", number: 7, label: "Move one of your Palette cards to the Canvas or Draw Deck" },
    { key: "five", number: 5, label: "Play another card from your hand to your Palette" },
    { key: "three", number: 3, label: "Draw a card from the Draw Deck" },
    { key: "one", number: 1, label: "Return an eligible opponent Palette card to the Draw Deck" },
  ];

  return (
    <fieldset className={styles.advancedRules} disabled={disabled}>
      <label className={styles.advancedParentRule}>
        <input
          ref={parentRef}
          type="checkbox"
          checked={allEnabled}
          onChange={(event) =>
            onChange({
              seven: event.target.checked,
              five: event.target.checked,
              three: event.target.checked,
              one: event.target.checked,
            })
          }
        />
        <strong>Advanced Red</strong>
      </label>
      <div className={styles.advancedChildren}>
        {options.map((option) => (
          <label key={option.key}>
            <input
              type="checkbox"
              checked={rules[option.key]}
              onChange={(event) =>
                onChange({ ...rules, [option.key]: event.target.checked })
              }
            />
            <b>{option.number}</b>
            <span>{option.label}</span>
          </label>
        ))}
      </div>
    </fieldset>
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

function PlayerPalette({
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
    <section
      className={[
        styles.playerPalette,
        player.id === currentWinnerId ? styles.winningPalette : "",
        player.eliminated ? styles.eliminatedPalette : "",
      ].join(" ")}
    >
      <div className={styles.playerPaletteHeading}>
        <span className={isOnline ? styles.onlineDot : styles.offlineDot} />
        <div>
          <h3>{player.displayName}</h3>
          <small>
            {player.handCount} card{player.handCount === 1 ? "" : "s"} ·{" "}
            {player.id === currentPlayerId
              ? "Playing"
              : player.eliminated
                ? "Eliminated"
                : isOnline
                  ? "Online"
                  : "Reconnecting"}
            {player.userId === hostUserId ? " · Host" : ""}
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
      <div className={styles.cardRow}>
        {player.palette.map((card) => (
          <Card key={cardKey(card)} card={card} compact />
        ))}
        {player.palette.length === 0 ? (
          <span className={styles.emptyPalette}>Empty</span>
        ) : null}
      </div>
    </section>
  );
}

function Card({
  card,
  compact = false,
  staged = false,
  disabled = false,
  muted = false,
  draggable = false,
  onClick,
  onPointerDragStart,
  onPointerDragMove,
  onPointerDragEnd,
  onPointerDragCancel,
}: {
  card: Red7Card;
  compact?: boolean;
  staged?: boolean;
  disabled?: boolean;
  muted?: boolean;
  draggable?: boolean;
  onClick?: () => void;
  onPointerDragStart?: (x: number, y: number) => void;
  onPointerDragMove?: (x: number, y: number) => void;
  onPointerDragEnd?: (x: number, y: number) => void;
  onPointerDragCancel?: () => void;
}) {
  return (
    <div
      className={[
        styles.card,
        compact ? styles.compactCard : "",
        staged ? styles.stagedCard : "",
        disabled ? styles.disabledCard : "",
        muted ? styles.mutedCard : "",
        draggable ? styles.draggableCard : "",
        onClick ? styles.clickableCard : "",
      ].join(" ")}
      data-color={card.color}
      aria-label={`${card.color} ${card.value}`}
      draggable={false}
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
      onPointerDown={(event) => {
        if (!draggable) return;
        event.preventDefault();
        event.currentTarget.setPointerCapture(event.pointerId);
        onPointerDragStart?.(event.clientX, event.clientY);
      }}
      onPointerMove={(event) => {
        if (!event.currentTarget.hasPointerCapture(event.pointerId)) return;
        onPointerDragMove?.(event.clientX, event.clientY);
      }}
      onPointerUp={(event) => {
        if (!event.currentTarget.hasPointerCapture(event.pointerId)) return;
        event.currentTarget.releasePointerCapture(event.pointerId);
        onPointerDragEnd?.(event.clientX, event.clientY);
      }}
      onPointerCancel={(event) => {
        if (event.currentTarget.hasPointerCapture(event.pointerId)) {
          event.currentTarget.releasePointerCapture(event.pointerId);
        }
        onPointerDragCancel?.();
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

function readableError(message: string) {
  return message
    .replace(/^.*?error:\s*/i, "")
    .replace(/\.$/, "")
    .concat(".");
}
