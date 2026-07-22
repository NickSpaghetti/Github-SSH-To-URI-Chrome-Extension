import { GITHUB_LINKS } from "../util/constants";

export const isSignedIn = (): boolean => {
    const anchorTags = document.getElementsByTagName("a");
    for (let i = 0; i < anchorTags.length; i++) {
        const lowerInnerText = anchorTags[i].innerText.toLowerCase();
        if (
            lowerInnerText === GITHUB_LINKS.SIGN_IN.toLowerCase() ||
            lowerInnerText === GITHUB_LINKS.SIGN_UP.toLowerCase()
        ) {
            return false;
        }
    }
    return true;
};
