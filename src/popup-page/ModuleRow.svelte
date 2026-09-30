<script lang="ts">
    import type { DisplayModule } from "../types/DisplayModule";
    import { normalizeConstraint } from "../domain/ConstraintClauses";
    import { suggestConstraint } from "../domain/ConstraintSuggestion";
    import { isSafeHttpUrl } from "../util/UrlSafety";
    import { toSourceLabel } from "./SourceLabel";

    /**
     * One module: its name as a link where there is somewhere to link to, the
     * buttons that copy it, and what its constraint resolved to.
     * @param module The module to show.
     * @param oncopy Called with the text a button put on the clipboard.
     */
    let {
        module,
        oncopy,
    }: { module: DisplayModule; oncopy: (text: string) => void } = $props();

    const constraint = $derived(normalizeConstraint(module.versionConstraint));
    const suggestion = $derived(suggestConstraint(module.versionConstraint, module.resolvedVersion));
    // Checked again here, not only where it was resolved: a module can reach
    // this row from the session cache, which stores whatever it was given.
    const link = $derived(
        module.resolvedUrl !== null && isSafeHttpUrl(module.resolvedUrl) ? module.resolvedUrl : null,
    );

    // Built here rather than in the markup, where svelte collapses the
    // whitespace that separates the parts.
    const detail = $derived(
        constraint === ""
            ? toSourceLabel(module.sourceType)
            : `${toSourceLabel(module.sourceType)}, ${constraint}`,
    );
</script>

{#if link !== null}
    <a class="ml-name" href={link} target="_blank" rel="noreferrer" title={module.moduleName}>
        {module.moduleName}
    </a>
{:else}
    <span class="ml-name" title={module.moduleName}>{module.moduleName}</span>
{/if}

<span class="ml-act">
    <button type="button" onclick={() => oncopy(module.moduleName)}>Copy name</button>
    {#if suggestion !== null}
        <button type="button" onclick={() => oncopy(suggestion)}>Copy {suggestion}</button>
    {/if}
</span>

<span class="ml-sub">
    {detail}{#if suggestion !== null}{" resolves to "}<span class="ml-up"
            >{module.resolvedVersion}</span
        >{/if}
</span>
