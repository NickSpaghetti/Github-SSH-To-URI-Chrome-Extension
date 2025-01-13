import React, {useState} from "react";
import { render } from "react-dom";
import { SaveOption } from "../types/SaveOption";
import { Handshake } from "@mui/icons-material";
import { ManageOptions } from "./ManageOptionComponent";
import { goTo } from "react-chrome-extension-router";

export const SaveOptions: React.FC = () => {
    const [domain, setDomain] = useState<string>(window.location.hostname)
    const [sourceControlService, setSourceControlServicel] = useState('private bitbucket')

    const handelSave = () => {
        const newOption: SaveOption = {
            domain: domain,
            sourceControlService: sourceControlService,
        }
        chrome.storage.sync.get('options', (data) => {
            const options = data.options || [];
            options.push(newOption);
            chrome.storage.sync.set({options})
        })
    }

    return (
        <div>
            <div>
                <label>
                    Domain Name:
                    <input type="text" value={domain} onChange={(e) => setDomain(e.target.value)}>
                    </input>
                </label>
                <div>
                    <label>
                        Source Control Service:
                        <select value={sourceControlService} onChange={(e) => setSourceControlServicel(e.target.value)}>
                            <option value={"private bitbucket"}>Private Bitbucket</option>
                            <option value={"bitbucket saas"}>Bitbucket SAAS</option>
                            <option value={"github saas"}>Github</option>
                        </select>
                    </label>
                </div>
                <button onClick={handelSave}>save custom domain</button>
            </div>
            <br></br>
            <button onClick={ () => goTo(ManageOptions)}>Manage Domains</button>
        </div>
    )
}
