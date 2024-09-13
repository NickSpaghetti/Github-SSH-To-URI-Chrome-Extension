import React from 'react'
import { render } from 'react-dom';
import { Link } from 'react-chrome-extension-router'
import { SaveOptions } from './SaveOptionComponent';
import { ManageOptions } from './ManageOptionComponent';

export const OptionsSideBar: React.FC = () => {
    return (
        <nav>
            <ul>
                <li>
                    <Link component={SaveOptions}>Save</Link>
                </li>
                <li>
                    <Link component={ManageOptions}>Manage</Link>
                </li>
            </ul>
        </nav>
    )
}

//render(<OptionsSideBar />, document.getElementById("options-sidebar-page"));