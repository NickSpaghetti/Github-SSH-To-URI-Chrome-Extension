import {GITHUB_LINKS} from "../util/constants";

export const IsSignedIn = (): boolean => {
    const anchorTags =  document.getElementsByTagName('a')
        for (let i = 0; i < anchorTags.length; i++) {
            let lowerInnerText = anchorTags[i].innerText.toLowerCase();
            if(lowerInnerText === GITHUB_LINKS.SIGN_IN.toLowerCase() || lowerInnerText == GITHUB_LINKS.SIGN_UP.toLowerCase()){
                return false;
            }
        }
        return true;
};