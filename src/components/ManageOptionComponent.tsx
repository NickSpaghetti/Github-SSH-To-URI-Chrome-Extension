import React, {useState, useEffect} from "react";
import { render } from "react-dom";
import { SaveOption } from "../types/SaveOption";
import { Typography } from "@mui/material";
import { SaveOptions } from "./SaveOptionComponent";
import { goTo, Link } from "react-chrome-extension-router";

export const ManageOptions: React.FC = () => {
    const [options, setOptions] = useState<SaveOption[]>([])
    
    useEffect(() => {
        chrome.storage.sync.get('options', (data) => {
            setOptions(data.options || [])
        })
    },[])

    const handelRemove = (index: number) => {
        const newOptions = options.filter((_,i) => i !== index);
        setOptions(newOptions);
        chrome.storage.sync.set({options: newOptions})
    }

    return (
        <div>
            <div>
                <label>
                    Manage Domains
                </label>
                {options.length === 0 ? (
                            <Typography variant='h6'>No Domains Found</Typography>
                    ) : (
                <ul>
                    {options.map((option: SaveOption, index: number) => 
                    <li key={index}>
                        {option.domain} - {option.sourceControlService}
                        <button onClick={() => handelRemove(index)}>Remove</button>
                    </li>
                    )}
                </ul>
                )}
            </div>
            <br></br>
            <button onClick={() => goTo(SaveOptions)}>Add Domain</button>
        </div>
    );
};