import {Terraform} from "../types/Terraform";
import {Module} from "../types/Module";

export interface IHclFile {
    terraform:Terraform[]
    module?: Map<string,Module[]>
}