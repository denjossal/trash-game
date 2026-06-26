<script lang="ts">
  // Home.svelte — the cold-open surface (Story 1.10, UX-DR3). Routed when no tableState exists yet
  // (routeFromState returns "home" for state === null). Two big primary actions — Start a table /
  // Join a table — with Join revealing a 4-slot Room Code field + a display-name entry. A bad/expired
  // code shows the warm inline BAD_CODE error under the field; the field stays, ready to retry.
  //
  // All visible game strings come from copy.ts (the single voice source — UX-DR16); the socket session
  // is driven through table-store.svelte's startTable()/joinTable() (NEVER socket.send from here —
  // GATE-1 bans .send outside socket.ts/push-state.ts). Primary actions sit in the lower thumb-zone.
  import { ROOM_CODE_ALPHABET, ROOM_CODE_LEN } from "@trash/shared";
  import Button from "../components/Button.svelte";
  import LanguageToggle from "../components/LanguageToggle.svelte";
  import { t } from "../lib/i18n.svelte";
  import { MAX_NAME_LEN } from "../lib/interaction";
  import { joinTable, startTable } from "../lib/table-store.svelte";

  // Which panel is open. This is local UI state (a disclosure), NOT navigation — the router still owns
  // *which surface* shows; once a create/join lands a tableState, App routes us to the Lobby.
  type Mode = "choose" | "start" | "join";
  let mode = $state<Mode>("choose");

  let name = $state("");
  let codeLetters = $state<string[]>(Array(ROOM_CODE_LEN).fill(""));
  // The warm inline error to show under the field (null = none). Distinct join failures map to a warm
  // message here; the raw server reason is NEVER surfaced to the Player.
  let error = $state<string | null>(null);
  let busy = $state(false);

  const code = $derived(codeLetters.join(""));
  const canJoin = $derived(code.length === ROOM_CODE_LEN && name.trim().length > 0 && !busy);
  const canStart = $derived(name.trim().length > 0 && !busy);

  let slotEls: HTMLInputElement[] = [];

  /** Keep only ambiguity-safe-alphabet letters, uppercased — mirrors the server's ROOM_CODE_ALPHABET. */
  function sanitize(raw: string): string {
    return raw
      .toUpperCase()
      .split("")
      .filter((ch) => ROOM_CODE_ALPHABET.includes(ch))
      .join("");
  }

  function onSlotInput(i: number, ev: Event): void {
    const el = ev.currentTarget as HTMLInputElement;
    const cleaned = sanitize(el.value);
    error = null;
    if (cleaned.length > 1) {
      // Paste-friendly: spread a multi-char paste across slots from here. Only `used` chars actually
      // land (the rest overflow past the last slot); focus the last filled slot.
      const next = [...codeLetters];
      let used = 0;
      for (let k = 0; k < cleaned.length && i + k < ROOM_CODE_LEN; k++, used++) next[i + k] = cleaned[k];
      codeLetters = next;
      // Re-sync the pasted-into element: its raw value still holds the whole paste, but `value={letter}`
      // won't re-render if codeLetters[i] is unchanged — so set it to the single char this slot now holds.
      el.value = next[i];
      slotEls[Math.min(i + used, ROOM_CODE_LEN) - 1]?.focus();
    } else {
      codeLetters[i] = cleaned;
      el.value = cleaned;
      if (cleaned.length === 1 && i < ROOM_CODE_LEN - 1) slotEls[i + 1]?.focus(); // auto-advance
    }
  }

  function onSlotKeydown(i: number, ev: KeyboardEvent): void {
    // Backspace on an empty slot steps back, so deleting a wrong code feels natural.
    if (ev.key === "Backspace" && codeLetters[i] === "" && i > 0) slotEls[i - 1]?.focus();
  }

  async function doStart(): Promise<void> {
    if (!canStart) return;
    busy = true;
    try {
      await startTable(name.trim()); // resolves → tableState lands → App routes to Lobby.
    } catch {
      // A create failure (server unreachable / exhausted retries) drops us back to a tappable state.
      busy = false;
    }
  }

  async function doJoin(): Promise<void> {
    if (!canJoin) return;
    busy = true;
    error = null;
    try {
      await joinTable(code, name.trim()); // resolves → tableState lands → App routes to Lobby.
    } catch (err) {
      // Map the typed reason to a warm, retryable message — never leak the raw reason to the Player.
      // A full / already-playing table gets its own copy (the code is RIGHT, so "check the letters" would
      // mislead); everything else (bad-code / transport) is the generic bad-code prompt. Field persists.
      const reason = (err as { reason?: string } | undefined)?.reason;
      error = reason === "room-full" || reason === "phase-illegal" ? t("TABLE_BUSY") : t("BAD_CODE");
      busy = false;
    }
  }
</script>

<main class="surface">
  <!-- Title + the quiet, one-time language choice. The toggle sits at the TOP, BEFORE the Room Code
       entry (Story 7.2): a Spanish-speaking relative picks their language the moment they open the app,
       off the clock. Per-device only — never a Host/Table control. -->
  <header class="head">
    <h1>{t("APP_NAME")}</h1>
    <LanguageToggle />
  </header>

  {#if mode === "choose"}
    <div class="actions">
      <Button onclick={() => (mode = "start")}>{t("START_TABLE")}</Button>
      <Button onclick={() => (mode = "join")}>{t("JOIN_TABLE")}</Button>
    </div>
  {:else}
    <form class="panel" onsubmit={(e) => e.preventDefault()}>
      {#if mode === "join"}
        <div class="code-row" role="group" aria-label="Room code">
          {#each codeLetters as letter, i (i)}
            <input
              bind:this={slotEls[i]}
              class="slot"
              type="text"
              inputmode="text"
              autocapitalize="characters"
              autocomplete="off"
              maxlength={ROOM_CODE_LEN}
              aria-label={`Room code letter ${i + 1}`}
              value={letter}
              oninput={(e) => onSlotInput(i, e)}
              onkeydown={(e) => onSlotKeydown(i, e)}
            />
          {/each}
        </div>
      {/if}

      <input
        class="name"
        type="text"
        aria-label="Your name"
        placeholder="Your name"
        maxlength={MAX_NAME_LEN}
        bind:value={name}
        autocomplete="off"
      />

      {#if error}
        <p class="error" role="alert">{error}</p>
      {/if}

      <div class="actions">
        {#if mode === "join"}
          <Button onclick={doJoin} disabled={!canJoin}>{t("JOIN_TABLE")}</Button>
        {:else}
          <Button onclick={doStart} disabled={!canStart}>{t("START_TABLE")}</Button>
        {/if}
      </div>
    </form>
  {/if}
</main>

<style>
  .surface {
    display: flex;
    flex-direction: column;
    align-items: center;
    /* Title up top; actions ride the lower thumb-zone (EXPERIENCE.md one-handed reach). */
    justify-content: space-between;
    min-height: 100dvh;
    padding: var(--space-container-padding);
    text-align: center;
    box-sizing: border-box;
  }
  /* Title + language toggle, stacked at the top (the toggle is the first thing, before the Room Code). */
  .head {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--space-stack-md);
    margin-top: var(--space-stack-xl);
  }
  h1 {
    font-family: var(--font-family-display);
    font-size: var(--type-display-lg-size);
    font-weight: var(--type-display-lg-weight);
    line-height: var(--type-display-lg-line);
    letter-spacing: var(--type-display-lg-tracking);
    margin: 0;
    color: var(--color-primary);
  }
  .panel,
  .actions {
    display: flex;
    flex-direction: column;
    gap: var(--space-stack-sm);
    width: 100%;
    max-width: 28rem;
  }
  .panel {
    margin-bottom: var(--space-stack-md);
  }
  .actions {
    margin-bottom: var(--space-stack-md); /* anchor low (thumb zone) */
  }
  .code-row {
    display: flex;
    gap: var(--space-stack-sm);
    justify-content: center;
  }
  .slot {
    width: 3.5rem;
    height: 4.5rem; /* >= 48dp */
    text-align: center;
    text-transform: uppercase;
    font-family: var(--font-family-display);
    font-size: var(--type-headline-lg-mobile-size);
    font-weight: var(--type-headline-lg-mobile-weight);
    color: var(--color-on-surface);
    background: var(--color-surface-container-high);
    border: 3px solid var(--color-outline);
    border-radius: var(--radius-default);
    caret-color: var(--color-secondary-container);
  }
  .name {
    height: 3.25rem; /* >= 48dp */
    padding: 0 var(--space-stack-sm);
    font-size: var(--type-body-lg-size);
    color: var(--color-on-surface);
    background: var(--color-surface-container-high);
    border: 3px solid var(--color-outline);
    border-radius: var(--radius-default);
    caret-color: var(--color-secondary-container);
  }
  .slot:focus-visible,
  .name:focus-visible {
    outline: var(--stroke-active);
    outline-offset: 2px;
    border-color: var(--color-secondary-container);
  }
  .error {
    color: var(--color-error);
    font-size: var(--type-body-md-size);
    font-weight: var(--type-body-md-weight);
    margin: 0;
  }
</style>
