import { mount } from "svelte";
import Popup from "./Popup.svelte";
import { readActiveTabModulesAsync } from "./ActiveTabModules";
import "./popup.css";

const container = document.getElementById("sources-popup");
if (container !== null) {
    readActiveTabModulesAsync()
        .then((modules) => mount(Popup, { target: container, props: { modules } }))
        .catch((error) => console.log(`could not open the popup: ${String(error)}`));
}
