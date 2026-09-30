<script lang="ts">
    import type { DisplayModule } from "../types/DisplayModule";
    import ModuleRow from "./ModuleRow.svelte";

    /**
     * The popup's list of the modules declared on the active tab, with a search
     * box, a count, and a live region announcing what a copy button did.
     * @param modules What the active tab declared, in the order it declared them.
     */
    let { modules }: { modules: DisplayModule[] } = $props();

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

    {#if modules.length === 0}
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
