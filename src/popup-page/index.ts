import { mount } from "svelte";
import Popup from "./Popup.svelte";
import { readTabModulesAsync, readyActiveTabAsync } from "./ActiveTabModules";
import { readPendingAccessAsync } from "./PageAccessRequest";
import { logRecovered } from "../util/Log";
import "./popup.css";

const container = document.getElementById("sources-popup");
/**
 * Reads what the popup shows for the tab it was opened over, then shows it.
 * @param target Where the popup is mounted.
 */
const openAsync = async (target: HTMLElement): Promise<void> => {
    const tab = await readyActiveTabAsync();
    const [modules, access] = await Promise.all([
        readTabModulesAsync(tab),
        readPendingAccessAsync(tab?.url ?? null),
    ]);
    mount(Popup, { target, props: { modules, access } });
};

if (container !== null) {
    openAsync(container).catch((error) => logRecovered("could not open the popup", error));
}
