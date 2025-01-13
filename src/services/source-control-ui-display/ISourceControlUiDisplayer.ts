import { DisplayHlcModule } from "../../models/DisplayHclModule";

export interface ISourceControlUiDisplayer {
    AddHyperLinksToModuleSource(modules: DisplayHlcModule[]): void
}