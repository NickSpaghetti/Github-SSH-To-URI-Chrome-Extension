<script lang="ts">
    import type { DisplayModule } from "../types/DisplayModule";
    import type { Nullable } from "../types/Nullable";
    import type { PendingAccess } from "./PageAccessRequest";
    import ModuleRow from "./ModuleRow.svelte";

    /**
     * The popup's list of the modules declared on the active tab, with a search
     * box, a count, and a live region announcing what a copy button did.
     * @param modules What the active tab declared, in the order it declared them.
     * @param access The host access the user has yet to grant, or null when none is needed.
     */
    let { modules, access }: { modules: DisplayModule[]; access: Nullable<PendingAccess> } =
        $props();

    const STATUS_MS = 2_000;

    let query = $state("");
    let status = $state("");
    let searchBox = $state<HTMLInputElement | undefined>(undefined);

    const matches = $derived.by(() => {
        const wanted = query.trim().toLowerCase();
        return wanted === ""
            ? modules
            : modules.filter((module) => module.moduleName.toLowerCase().includes(wanted));
    });

    const count = $derived.by(() => {
        if (modules.length === matches.length) {
            return `${modules.length} ${modules.length === 1 ? "module" : "modules"}`;
        }
        return `${matches.length} of ${modules.length}`;
    });

    $effect(() => {
        searchBox?.focus();
    });

    let allowed = $state(false);

    // Chrome refuses a permission request made after anything has been
    // awaited, so the request is the first thing the click does.
    const allow = (pending: PendingAccess) => {
        pending
            .requestAsync()
            .then((granted) => {
                allowed = granted;
                if (!granted) {
                    status = `Links stay off on ${pending.host}`;
                }
            })
            .catch(() => (status = `Could not ask for access to ${pending.host}`));
    };

    let clearing: ReturnType<typeof setTimeout> | undefined;
    const copy = async (text: string) => {
        try {
            await navigator.clipboard.writeText(text);
            status = `Copied ${text}`;
        } catch {
            status = `Could not copy ${text}`;
        }
        // A second copy inside the window would otherwise be wiped early by
        // the first one's timer.
        clearTimeout(clearing);
        clearing = setTimeout(() => (status = ""), STATUS_MS);
    };
</script>

<div class="ml">
    {#if access !== null}
        <div class="ml-access">
            {#if allowed}
                <p>Links are on for {access.host}.</p>
            {:else}
                <p>Links on {access.host} pages need your permission.</p>
                <button type="button" onclick={() => allow(access)}>Allow on {access.host}</button>
            {/if}
        </div>
    {/if}

    <div class="ml-search">
        <label for="ml-q" class="ml-sr">Search modules</label>
        <input
            id="ml-q"
            bind:this={searchBox}
            bind:value={query}
            type="search"
            placeholder="Search modules"
            autocomplete="off"
        />
        <span class="ml-count">{count}</span>
    </div>

    {#if modules.length === 0 && access !== null && !allowed}
        <p class="ml-empty">Allow {access.host} to see this page's modules.</p>
    {:else if modules.length === 0}
        <p class="ml-empty">No modules on this page.</p>
    {:else if matches.length === 0}
        <p class="ml-empty">No module matches "{query}".</p>
    {:else}
        <ul class="ml-list">
            <!-- Keyed on the name, which terraform requires be unique in a
                 file, so narrowing the search moves rows instead of rewriting
                 them. -->
            {#each matches as module (module.moduleName)}
                <li><ModuleRow {module} oncopy={copy} /></li>
            {/each}
        </ul>
    {/if}

    <div class="ml-live" aria-live="polite">{status}</div>
</div>
