import {Terraform} from "../types/Terraform";
import {Module} from "../types/Module";

export interface IHclFile {
    module?: Module[]
    terraform:Terraform[]
}