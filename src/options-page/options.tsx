import { Save } from "@mui/icons-material";
import React, {useState, useEffect} from "react";
import { render } from "react-dom";
import { ManageOptions } from "../components/ManageOptionComponent";
import { SaveOptions } from "../components/SaveOptionComponent";
import { OptionsSideBar } from "../components/OptionsSideBar";
import { Route, Routes } from "react-router-dom";
import { Link, Router } from "react-chrome-extension-router";

export const Options: React.FC = () => {
        return (
            <div>
                <Router>
                    <SaveOptions></SaveOptions>
                </Router>
            </div>
        )
    
}

render(<Options />, document.getElementById("options-page"));
