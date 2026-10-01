terraform {
  source = "hashicorp/terraform"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 6.0"
    }
  }
}

module "vpc" {
  source  = "terraform-aws-modules/vpc/aws"
  version = "6.7.3"
}

locals {
  modules = "terraform-aws-modules"
}

module "templated" {
  source = "${local.modules}/security-group/aws"
}

module "unresolved" {
  source = "${var.not_in_this_file}//modules/vpc"
}
