"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import type { Session } from "@supabase/supabase-js";
import { getLoginPath } from "@/lib/auth/redirects";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import type { Tables } from "@/lib/supabase/database.types";
import styles from "./flashcards.module.css";

type FlashcardSet = Pick<
  Tables<"flashcard_sets">,
  "id" | "title" | "description" | "updated_at"
>;

type Flashcard = Pick<
  Tables<"flashcards">,
  "id" | "set_id" | "question" | "answer" | "created_at"
>;

type PlayCard = Flashcard & {
  setTitle: string;
};

type StudyCardState = {
  weight: number;
  cooldown: number;
  seen: number;
  correct: number;
  wrong: number;
};

type StudyState = Record<string, StudyCardState>;

const tabs = [
  { value: "sets", label: "Sets" },
  { value: "cards", label: "Cards" },
  { value: "play", label: "Play" },
];

const emptyStudyCardState: StudyCardState = {
  weight: 1,
  cooldown: 0,
  seen: 0,
  correct: 0,
  wrong: 0,
};

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

export function FlashcardsApp() {
  const supabase = useMemo(() => createBrowserSupabaseClient(), []);
  const [session, setSession] = useState<Session | null>(null);
  const [authMessage, setAuthMessage] = useState("Checking account...");
  const [sets, setSets] = useState<FlashcardSet[]>([]);
  const [cards, setCards] = useState<Flashcard[]>([]);
  const [activeTab, setActiveTab] = useState("sets");
  const [selectedSetId, setSelectedSetId] = useState("");
  const [selectedPlaySetIds, setSelectedPlaySetIds] = useState<string[]>([]);
  const [setTitle, setSetTitle] = useState("");
  const [setDescription, setSetDescription] = useState("");
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [editingSetId, setEditingSetId] = useState<string | null>(null);
  const [editingCardId, setEditingCardId] = useState<string | null>(null);
  const [message, setMessage] = useState("Sign in to load your flashcards.");
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [studyState, setStudyState] = useState<StudyState>({});
  const [currentCard, setCurrentCard] = useState<PlayCard | null>(null);
  const [isAnswerShown, setIsAnswerShown] = useState(false);
  const [sessionStarted, setSessionStarted] = useState(false);
  const loginPath = getLoginPath("/projects/flashcards");

  const loadFlashcards = useCallback(
    async (nextSession: Session | null) => {
      if (!supabase || !nextSession) {
        setSets([]);
        setCards([]);
        setSelectedSetId("");
        setSelectedPlaySetIds([]);
        setMessage("Sign in to load your flashcards.");
        return;
      }

      setIsLoading(true);
      setMessage("Loading flashcards...");

      const [setsResponse, cardsResponse] = await Promise.all([
        supabase
          .from("flashcard_sets")
          .select("id, title, description, updated_at")
          .eq("user_id", nextSession.user.id)
          .order("updated_at", { ascending: false }),
        supabase
          .from("flashcards")
          .select("id, set_id, question, answer, created_at")
          .eq("user_id", nextSession.user.id)
          .order("created_at", { ascending: true }),
      ]);

      if (setsResponse.error || cardsResponse.error) {
        setSets([]);
        setCards([]);
        setMessage("Run the flashcards Supabase migration to enable this project.");
        setIsLoading(false);
        return;
      }

      const nextSets = (setsResponse.data ?? []) as FlashcardSet[];
      const nextCards = (cardsResponse.data ?? []) as Flashcard[];

      setSets(nextSets);
      setCards(nextCards);
      setSelectedSetId((currentSetId) => {
        if (nextSets.some((set) => set.id === currentSetId)) {
          return currentSetId;
        }

        return nextSets[0]?.id ?? "";
      });
      setSelectedPlaySetIds((currentSetIds) => {
        const availableIds = new Set(nextSets.map((set) => set.id));
        const retainedIds = currentSetIds.filter((setId) =>
          availableIds.has(setId),
        );

        return retainedIds.length > 0
          ? retainedIds
          : nextSets[0]
            ? [nextSets[0].id]
            : [];
      });
      setMessage(
        nextSets.length > 0
          ? `${nextSets.length} set${nextSets.length === 1 ? "" : "s"} and ${nextCards.length} card${nextCards.length === 1 ? "" : "s"} loaded.`
          : "Create your first set to start studying.",
      );
      setIsLoading(false);
    },
    [supabase],
  );

  useEffect(() => {
    if (!supabase) {
      setAuthMessage("Add the Supabase publishable key to enable flashcards.");
      return;
    }

    let isMounted = true;

    supabase.auth.getSession().then(({ data }) => {
      if (!isMounted) {
        return;
      }

      setSession(data.session);
      setAuthMessage(data.session ? "Signed in." : "Sign up or log in.");
      loadFlashcards(data.session);
    });

    const { data: listener } = supabase.auth.onAuthStateChange(
      (_event, nextSession) => {
        setSession(nextSession);
        setAuthMessage(nextSession ? "Signed in." : "Sign up or log in.");
        loadFlashcards(nextSession);
      },
    );

    return () => {
      isMounted = false;
      listener.subscription.unsubscribe();
    };
  }, [loadFlashcards, supabase]);

  const setById = useMemo(() => {
    return new Map(sets.map((set) => [set.id, set]));
  }, [sets]);

  const cardsBySet = useMemo(() => {
    const grouped = new Map<string, Flashcard[]>();

    for (const card of cards) {
      grouped.set(card.set_id, [...(grouped.get(card.set_id) ?? []), card]);
    }

    return grouped;
  }, [cards]);

  const visibleCards = selectedSetId
    ? (cardsBySet.get(selectedSetId) ?? [])
    : [];
  const visibleCardColumns = useMemo(() => {
    return visibleCards.reduce<[Flashcard[], Flashcard[]]>(
      (columns, card, index) => {
        columns[index % 2].push(card);
        return columns;
      },
      [[], []],
    );
  }, [visibleCards]);
  const editingCard = editingCardId
    ? (cards.find((card) => card.id === editingCardId) ?? null)
    : null;
  const editingSet = editingSetId
    ? (sets.find((set) => set.id === editingSetId) ?? null)
    : null;

  const playableCards = useMemo<PlayCard[]>(() => {
    const selectedIds = new Set(selectedPlaySetIds);

    return cards
      .filter((card) => selectedIds.has(card.set_id))
      .map((card) => ({
        ...card,
        setTitle: setById.get(card.set_id)?.title ?? "Untitled set",
      }));
  }, [cards, selectedPlaySetIds, setById]);

  const studyTotals = useMemo(() => {
    return Object.values(studyState).reduce(
      (total, cardState) => ({
        seen: total.seen + cardState.seen,
        correct: total.correct + cardState.correct,
        wrong: total.wrong + cardState.wrong,
      }),
      { seen: 0, correct: 0, wrong: 0 },
    );
  }, [studyState]);

  async function handleCreateSet(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!supabase || !session) {
      return;
    }

    const trimmedTitle = setTitle.trim();

    if (!trimmedTitle) {
      setMessage("Give the set a title first.");
      return;
    }

    setIsSaving(true);
    const { error } = await supabase.from("flashcard_sets").insert({
      user_id: session.user.id,
      title: trimmedTitle,
      description: setDescription.trim(),
    });

    if (error) {
      setMessage("Could not create that set.");
    } else {
      setSetTitle("");
      setSetDescription("");
      setMessage("Set created.");
      await loadFlashcards(session);
    }

    setIsSaving(false);
  }

  async function handleSaveEditedSet(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!supabase || !session || !editingSetId) {
      return;
    }

    const trimmedTitle = setTitle.trim();

    if (!trimmedTitle) {
      setMessage("Give the set a title first.");
      return;
    }

    setIsSaving(true);
    const { error } = await supabase
      .from("flashcard_sets")
      .update({
        title: trimmedTitle,
        description: setDescription.trim(),
      })
      .eq("id", editingSetId)
      .eq("user_id", session.user.id);

    if (error) {
      setMessage("Could not save that set.");
    } else {
      setEditingSetId(null);
      setSetTitle("");
      setSetDescription("");
      setMessage("Set updated.");
      await loadFlashcards(session);
    }

    setIsSaving(false);
  }

  async function handleAddCard(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!supabase || !session || !selectedSetId) {
      return;
    }

    const trimmedQuestion = question.trim();
    const trimmedAnswer = answer.trim();

    if (!trimmedQuestion || !trimmedAnswer) {
      setMessage("Cards need both a question and an answer.");
      return;
    }

    setIsSaving(true);
    const { error } = await supabase.from("flashcards").insert({
      set_id: selectedSetId,
      user_id: session.user.id,
      question: trimmedQuestion,
      answer: trimmedAnswer,
    });

    if (error) {
      setMessage("Could not add that card.");
    } else {
      setQuestion("");
      setAnswer("");
      setMessage("Card added.");
      await loadFlashcards(session);
    }

    setIsSaving(false);
  }

  async function handleSaveEditedCard(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!supabase || !session || !editingCardId) {
      return;
    }

    const trimmedQuestion = question.trim();
    const trimmedAnswer = answer.trim();

    if (!trimmedQuestion || !trimmedAnswer) {
      setMessage("Cards need both a question and an answer.");
      return;
    }

    setIsSaving(true);
    const { error } = await supabase
      .from("flashcards")
      .update({
        question: trimmedQuestion,
        answer: trimmedAnswer,
      })
      .eq("id", editingCardId)
      .eq("user_id", session.user.id);

    if (error) {
      setMessage("Could not save that card.");
    } else {
      setEditingCardId(null);
      setQuestion("");
      setAnswer("");
      setMessage("Card updated.");
      await loadFlashcards(session);
    }

    setIsSaving(false);
  }

  function startEditingCard(card: Flashcard) {
    setEditingCardId(card.id);
    setSelectedSetId(card.set_id);
    setQuestion(card.question);
    setAnswer(card.answer);
    setMessage("Editing card.");
  }

  function cancelEditingCard() {
    setEditingCardId(null);
    setQuestion("");
    setAnswer("");
    setMessage("Edit cancelled.");
  }

  function startEditingSet(set: FlashcardSet) {
    setEditingSetId(set.id);
    setSetTitle(set.title);
    setSetDescription(set.description);
    setMessage("Editing set.");
  }

  function cancelEditingSet() {
    setEditingSetId(null);
    setSetTitle("");
    setSetDescription("");
    setMessage("Edit cancelled.");
  }

  async function handleDeleteCard(cardId: string) {
    if (!supabase || !session) {
      return;
    }

    setIsSaving(true);
    const { error } = await supabase
      .from("flashcards")
      .delete()
      .eq("id", cardId)
      .eq("user_id", session.user.id);

    if (!error && editingCardId === cardId) {
      setEditingCardId(null);
      setQuestion("");
      setAnswer("");
    }

    setMessage(error ? "Could not delete that card." : "Card deleted.");
    await loadFlashcards(session);
    setIsSaving(false);
  }

  async function handleDeleteSet(setId: string) {
    if (!supabase || !session) {
      return;
    }

    setIsSaving(true);
    const { error } = await supabase
      .from("flashcard_sets")
      .delete()
      .eq("id", setId)
      .eq("user_id", session.user.id);

    if (!error && editingSetId === setId) {
      setEditingSetId(null);
      setSetTitle("");
      setSetDescription("");
    }

    setMessage(error ? "Could not delete that set." : "Set deleted.");
    await loadFlashcards(session);
    setIsSaving(false);
  }

  function togglePlaySet(setId: string) {
    setSelectedPlaySetIds((currentSetIds) => {
      if (currentSetIds.includes(setId)) {
        return currentSetIds.filter((currentSetId) => currentSetId !== setId);
      }

      return [...currentSetIds, setId];
    });
  }

  function startStudySession() {
    if (playableCards.length === 0) {
      setMessage("Pick at least one set with cards before playing.");
      return;
    }

    const nextStudyState = Object.fromEntries(
      playableCards.map((card) => [card.id, { ...emptyStudyCardState }]),
    );

    setStudyState(nextStudyState);
    setCurrentCard(pickNextCard(playableCards, nextStudyState, null));
    setIsAnswerShown(false);
    setSessionStarted(true);
    setMessage("Study session started.");
  }

  function gradeCurrentCard(wasCorrect: boolean) {
    if (!currentCard) {
      return;
    }

    const nextStudyState = updateStudyState(
      playableCards,
      studyState,
      currentCard.id,
      wasCorrect,
    );

    setStudyState(nextStudyState);
    setCurrentCard(pickNextCard(playableCards, nextStudyState, currentCard.id));
    setIsAnswerShown(false);
  }

  return (
    <main className={styles.flashcardsPage}>
      <div className={styles.flashcardsInner}>
        <section className={styles.hero}>
          <p className={`${styles.eyebrow} font-mono text-xs uppercase`}>
            /projects/flashcards
          </p>
          <div className={styles.heroRow}>
            <div>
              <h1 className={`${styles.title} font-mono text-3xl font-bold uppercase tracking-normal sm:text-4xl`}>
                Flashcards
              </h1>
              <p className={styles.lede}>
                Make study sets, add question-answer cards, then practice with
                weighted repetition.
              </p>
            </div>
            <p className={`${styles.statusBadge} font-mono text-xs uppercase`}>
              {authMessage}
            </p>
          </div>
        </section>

        {!session ? (
          <section className={styles.formPanel}>
            <div className={styles.panelHeader}>
              <div>
                <p className={`${styles.eyebrow} font-mono text-xs uppercase`}>
                  Account
                </p>
                <h2 className={`${styles.panelTitle} font-mono text-2xl font-bold uppercase tracking-normal`}>
                  Sign In Required
                </h2>
              </div>
            </div>
            <p className={styles.lede}>
              Flashcard sets are saved to your account, so this project starts
              after login.
            </p>
            <div className={styles.actions}>
              <a
                href={loginPath}
                className={`${styles.button} inline-flex items-center font-mono text-sm font-bold uppercase`}
              >
                Log In
              </a>
            </div>
          </section>
        ) : (
          <>
            <div className={styles.tabBar}>
              {tabs.map((tab) => (
                <button
                  key={tab.value}
                  type="button"
                  onClick={() => setActiveTab(tab.value)}
                  className={cx(
                    `${styles.tabButton} font-mono text-sm font-bold uppercase`,
                    activeTab === tab.value && styles.tabButtonActive,
                  )}
                >
                  {tab.label}
                </button>
              ))}
            </div>
            <p className={`${styles.message} font-mono text-sm`}>
              {isLoading ? "Loading..." : message}
            </p>

            {activeTab === "sets" ? (
              <section className={styles.sectionGrid}>
                <form
                  onSubmit={editingSetId ? handleSaveEditedSet : handleCreateSet}
                  className={styles.formPanel}
                >
                  <div className={styles.panelHeader}>
                    <div>
                      <p className={`${styles.eyebrow} font-mono text-xs uppercase`}>
                        {editingSetId ? "Revise" : "Build"}
                      </p>
                      <h2 className={`${styles.panelTitle} font-mono text-2xl font-bold uppercase tracking-normal`}>
                        {editingSetId ? "Edit Set" : "New Set"}
                      </h2>
                    </div>
                  </div>
                  <label className={`${styles.field} ${styles.label} font-mono text-xs font-bold uppercase`}>
                    Title
                    <input
                      value={setTitle}
                      onChange={(event) =>
                        setSetTitle(capitalizeFirstLetter(event.target.value))
                      }
                      className={`${styles.input} text-base`}
                      maxLength={80}
                      autoCapitalize="sentences"
                    />
                  </label>
                  <label className={`${styles.field} ${styles.label} font-mono text-xs font-bold uppercase`}>
                    Notes
                    <textarea
                      value={setDescription}
                      onChange={(event) =>
                        setSetDescription(
                          capitalizeFirstLetter(event.target.value),
                        )
                      }
                      className={`${styles.textarea} font-sans text-base`}
                      maxLength={240}
                      autoCapitalize="sentences"
                    />
                  </label>
                  <div className={styles.actions}>
                    <button
                      type="submit"
                      disabled={isSaving}
                      className={`${styles.button} font-mono text-sm font-bold uppercase`}
                    >
                      {editingSetId ? "Save Set" : "Create Set"}
                    </button>
                    {editingSetId ? (
                      <button
                        type="button"
                        onClick={cancelEditingSet}
                        disabled={isSaving}
                        className={`${styles.secondaryButton} font-mono text-sm font-bold uppercase`}
                      >
                        Cancel
                      </button>
                    ) : null}
                  </div>
                  {editingSet ? (
                    <p className={styles.formNote}>
                      Editing {editingSet.title}.
                    </p>
                  ) : null}
                </form>

                <section className={styles.panel}>
                  <div className={styles.panelHeader}>
                    <div>
                      <p className={`${styles.eyebrow} font-mono text-xs uppercase`}>
                        Library
                      </p>
                      <h2 className={`${styles.panelTitle} font-mono text-2xl font-bold uppercase tracking-normal`}>
                        Sets
                      </h2>
                    </div>
                  </div>
                  <div className={`${styles.cardGrid} ${styles.cardStack}`}>
                    {sets.map((set) => (
                      <article key={set.id} className={styles.card}>
                        <div className={styles.cardHeader}>
                          <h3 className={`${styles.cardTitle} font-mono text-xl font-bold uppercase tracking-normal`}>
                            {set.title}
                          </h3>
                          <p className={`${styles.metaLabel} font-mono text-xs uppercase`}>
                            {cardsBySet.get(set.id)?.length ?? 0} cards
                          </p>
                        </div>
                        {set.description ? (
                          <p className={styles.cardText}>{set.description}</p>
                        ) : null}
                        <div className={styles.actions}>
                          <button
                            type="button"
                            onClick={() => startEditingSet(set)}
                            disabled={isSaving}
                            className={`${styles.secondaryButton} font-mono text-xs font-bold uppercase`}
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedSetId(set.id);
                              setActiveTab("cards");
                            }}
                            className={`${styles.secondaryButton} font-mono text-xs font-bold uppercase`}
                          >
                            Add Cards
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteSet(set.id)}
                            disabled={isSaving}
                            className={`${styles.dangerButton} font-mono text-xs font-bold uppercase`}
                          >
                            Delete
                          </button>
                        </div>
                      </article>
                    ))}
                    {sets.length === 0 ? (
                      <p className={styles.empty}>No flashcard sets yet.</p>
                    ) : null}
                  </div>
                </section>
              </section>
            ) : null}

            {activeTab === "cards" ? (
              <section className={styles.sectionGrid}>
                <form
                  onSubmit={editingCardId ? handleSaveEditedCard : handleAddCard}
                  className={styles.formPanel}
                >
                  <div className={styles.panelHeader}>
                    <div>
                      <p className={`${styles.eyebrow} font-mono text-xs uppercase`}>
                        {editingCardId ? "Revise" : "Write"}
                      </p>
                      <h2 className={`${styles.panelTitle} font-mono text-2xl font-bold uppercase tracking-normal`}>
                        {editingCardId ? "Edit Card" : "Add Card"}
                      </h2>
                    </div>
                  </div>
                  <label className={`${styles.field} ${styles.label} font-mono text-xs font-bold uppercase`}>
                    Set
                    <select
                      value={selectedSetId}
                      onChange={(event) => {
                        setSelectedSetId(event.target.value);
                        if (editingCardId) {
                          cancelEditingCard();
                        }
                      }}
                      className={`${styles.select} text-base`}
                      disabled={Boolean(editingCardId)}
                    >
                      {sets.map((set) => (
                        <option key={set.id} value={set.id}>
                          {set.title}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className={`${styles.field} ${styles.label} font-mono text-xs font-bold uppercase`}>
                    Question
                    <textarea
                      value={question}
                      onChange={(event) =>
                        setQuestion(capitalizeFirstLetter(event.target.value))
                      }
                      className={`${styles.textarea} font-sans text-base`}
                      autoCapitalize="sentences"
                    />
                  </label>
                  <label className={`${styles.field} ${styles.label} font-mono text-xs font-bold uppercase`}>
                    Answer
                    <textarea
                      value={answer}
                      onChange={(event) =>
                        setAnswer(capitalizeFirstLetter(event.target.value))
                      }
                      className={`${styles.textarea} font-sans text-base`}
                      autoCapitalize="sentences"
                    />
                  </label>
                  <div className={styles.actions}>
                    <button
                      type="submit"
                      disabled={isSaving || !selectedSetId}
                      className={`${styles.button} font-mono text-sm font-bold uppercase`}
                    >
                      {editingCardId ? "Save Card" : "Add Card"}
                    </button>
                    {editingCardId ? (
                      <button
                        type="button"
                        onClick={cancelEditingCard}
                        disabled={isSaving}
                        className={`${styles.secondaryButton} font-mono text-sm font-bold uppercase`}
                      >
                        Cancel
                      </button>
                    ) : null}
                  </div>
                  {editingCard ? (
                    <p className={styles.formNote}>
                      Editing a card from {setById.get(editingCard.set_id)?.title ?? "this set"}.
                    </p>
                  ) : null}
                </form>

                <section className={styles.panel}>
                  <div className={styles.panelHeader}>
                    <div>
                      <p className={`${styles.eyebrow} font-mono text-xs uppercase`}>
                        Current Set
                      </p>
                      <h2 className={`${styles.panelTitle} font-mono text-2xl font-bold uppercase tracking-normal`}>
                        Cards
                      </h2>
                    </div>
                  </div>
                  <div className={styles.flashcardGrid}>
                    {visibleCardColumns.map((columnCards, columnIndex) => (
                      <div
                        key={`column-${columnIndex}`}
                        className={styles.flashcardColumn}
                      >
                        {columnCards.map((card) => (
                          <article
                            key={card.id}
                            className={`${styles.card} ${styles.studyCardPreview}`}
                          >
                            <p className={styles.previewQuestion}>
                              {card.question}
                            </p>
                            <div className={styles.previewAnswerBox}>
                              <p className={styles.previewAnswer}>
                                {card.answer}
                              </p>
                            </div>
                            <div className={styles.actions}>
                              <button
                                type="button"
                                onClick={() => startEditingCard(card)}
                                disabled={isSaving}
                                className={`${styles.secondaryButton} font-mono text-xs font-bold uppercase`}
                              >
                                Edit
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDeleteCard(card.id)}
                                disabled={isSaving}
                                className={`${styles.dangerButton} font-mono text-xs font-bold uppercase`}
                              >
                                Delete
                              </button>
                            </div>
                          </article>
                        ))}
                      </div>
                    ))}
                    {selectedSetId && visibleCards.length === 0 ? (
                      <p className={styles.empty}>This set has no cards yet.</p>
                    ) : null}
                    {!selectedSetId ? (
                      <p className={styles.empty}>Create a set before adding cards.</p>
                    ) : null}
                  </div>
                </section>
              </section>
            ) : null}

            {activeTab === "play" ? (
              <section className={styles.wideGrid}>
                <aside className={styles.formPanel}>
                  <div className={styles.panelHeader}>
                    <div>
                      <p className={`${styles.eyebrow} font-mono text-xs uppercase`}>
                        Session
                      </p>
                      <h2 className={`${styles.panelTitle} font-mono text-2xl font-bold uppercase tracking-normal`}>
                        Study Sets
                      </h2>
                    </div>
                  </div>
                  <div className={styles.setPicker}>
                    {sets.map((set) => (
                      <label key={set.id} className={styles.setOption}>
                        <input
                          type="checkbox"
                          checked={selectedPlaySetIds.includes(set.id)}
                          onChange={() => togglePlaySet(set.id)}
                        />
                        <span>
                          <span className={`${styles.cardTitle} block font-mono text-sm font-bold uppercase`}>
                            {set.title}
                          </span>
                          <span className={`${styles.metaLabel} block text-sm`}>
                            {cardsBySet.get(set.id)?.length ?? 0} cards
                          </span>
                        </span>
                      </label>
                    ))}
                  </div>
                  <div className={styles.actions}>
                    <button
                      type="button"
                      onClick={startStudySession}
                      className={`${styles.button} w-full font-mono text-sm font-bold uppercase`}
                    >
                      Start Play
                    </button>
                  </div>
                  <div className={`${styles.statsGrid} font-mono text-xs uppercase`}>
                    <div className={styles.stat}>
                      <strong className={styles.statValue}>
                        {studyTotals.seen}
                      </strong>
                      Seen
                    </div>
                    <div className={styles.stat}>
                      <strong className={styles.statValue}>
                        {studyTotals.correct}
                      </strong>
                      Right
                    </div>
                    <div className={styles.stat}>
                      <strong className={styles.statValue}>
                        {studyTotals.wrong}
                      </strong>
                      Wrong
                    </div>
                  </div>
                </aside>

                <section className={`${styles.panel} ${styles.studyPanel}`}>
                  {currentCard ? (
                    <>
                      <p className={`${styles.eyebrow} font-mono text-xs uppercase`}>
                        {currentCard.setTitle}
                      </p>
                      <div className={styles.flipStage}>
                        <div
                          className={cx(
                            styles.flipCard,
                            isAnswerShown && styles.flipCardShown,
                          )}
                        >
                          <CardFace label="Question" text={currentCard.question} />
                          <CardFace
                            label="Answer"
                            text={currentCard.answer}
                            flipped
                          />
                        </div>
                      </div>
                      <div className={styles.actions}>
                        {!isAnswerShown ? (
                          <button
                            type="button"
                            onClick={() => setIsAnswerShown(true)}
                            className={`${styles.button} font-mono text-sm font-bold uppercase`}
                          >
                            Show Answer
                          </button>
                        ) : (
                          <>
                            <button
                              type="button"
                              onClick={() => gradeCurrentCard(false)}
                              className={`${styles.dangerButton} font-mono text-sm font-bold uppercase`}
                            >
                              Got It Wrong
                            </button>
                            <button
                              type="button"
                              onClick={() => gradeCurrentCard(true)}
                              className={`${styles.button} font-mono text-sm font-bold uppercase`}
                            >
                              Got It Right
                            </button>
                          </>
                        )}
                      </div>
                    </>
                  ) : (
                    <div className={styles.studyEmpty}>
                      <div>
                        <h2 className={`${styles.panelTitle} font-mono text-2xl font-bold uppercase tracking-normal`}>
                          {sessionStarted ? "No Card Ready" : "Ready To Play"}
                        </h2>
                        <p className={styles.lede}>
                          Pick one or more sets with cards, then start a play
                          session.
                        </p>
                      </div>
                    </div>
                  )}
                </section>
              </section>
            ) : null}
          </>
        )}
      </div>
    </main>
  );
}

function CardFace({
  label,
  text,
  flipped = false,
}: {
  label: string;
  text: string;
  flipped?: boolean;
}) {
  return (
    <div
      className={cx(
        styles.cardFace,
        flipped && styles.cardFaceBack,
      )}
    >
      <p className={`${styles.metaLabel} font-mono text-xs font-bold uppercase`}>
        {label}
      </p>
      <p className={styles.studyText}>{text}</p>
    </div>
  );
}

function capitalizeFirstLetter(value: string) {
  return value.replace(/^(\s*)([a-z])/, (_match, prefix: string, letter: string) =>
    `${prefix}${letter.toUpperCase()}`,
  );
}

function getCardState(studyState: StudyState, cardId: string) {
  return studyState[cardId] ?? emptyStudyCardState;
}

function updateStudyState(
  cards: PlayCard[],
  studyState: StudyState,
  gradedCardId: string,
  wasCorrect: boolean,
) {
  const nextStudyState: StudyState = {};
  const correctCooldown = Math.min(5, Math.max(2, Math.ceil(cards.length / 3)));
  const wrongCooldown = cards.length > 2 ? 1 : 0;

  for (const card of cards) {
    const currentState = getCardState(studyState, card.id);
    const isGradedCard = card.id === gradedCardId;

    if (!isGradedCard) {
      nextStudyState[card.id] = {
        ...currentState,
        cooldown: Math.max(0, currentState.cooldown - 1),
      };
      continue;
    }

    nextStudyState[card.id] = {
      weight: wasCorrect
        ? Math.max(0.2, currentState.weight * 0.55)
        : Math.min(8, currentState.weight * 1.8 + 0.5),
      cooldown: wasCorrect ? correctCooldown : wrongCooldown,
      seen: currentState.seen + 1,
      correct: currentState.correct + (wasCorrect ? 1 : 0),
      wrong: currentState.wrong + (wasCorrect ? 0 : 1),
    };
  }

  return nextStudyState;
}

function pickNextCard(
  cards: PlayCard[],
  studyState: StudyState,
  previousCardId: string | null,
) {
  if (cards.length === 0) {
    return null;
  }

  const nonPreviousCards =
    cards.length > 1
      ? cards.filter((card) => card.id !== previousCardId)
      : cards;
  const eligibleCards = nonPreviousCards.filter(
    (card) => getCardState(studyState, card.id).cooldown <= 0,
  );
  const pool = eligibleCards.length > 0 ? eligibleCards : nonPreviousCards;
  const totalWeight = pool.reduce(
    (total, card) => total + getCardState(studyState, card.id).weight,
    0,
  );
  let cursor = Math.random() * totalWeight;

  for (const card of pool) {
    cursor -= getCardState(studyState, card.id).weight;

    if (cursor <= 0) {
      return card;
    }
  }

  return pool[pool.length - 1] ?? null;
}
