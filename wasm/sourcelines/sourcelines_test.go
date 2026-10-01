package sourcelines

import (
	"reflect"
	"testing"
)

func TestFindHcl(t *testing.T) {
	contents := `terraform {
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 6.0"
    }
    google = { source = "hashicorp/google" }
  }
}

module "consul_old" {
  source  = "hashicorp/consul/aws"
  version = "0.1.0"
}

module "consul_new" {
  version = "0.12.0"

  source = "hashicorp/consul/aws"
}

module "no_source" {
  cidr = "10.0.0.0/16"
}
`
	want := map[string]int{
		"required_providers.aws":    4,
		"required_providers.google": 7,
		"consul_old":                12,
		"consul_new":                19,
	}

	got := Find([]byte(contents), "main.tf")

	if !reflect.DeepEqual(got, want) {
		t.Fatalf("got %v, want %v", got, want)
	}
}

func TestFindJson(t *testing.T) {
	contents := `{
  "terraform": {
    "required_providers": {
      "aws": {
        "source": "hashicorp/aws"
      }
    }
  },
  "module": {
    "consul_old": {
      "source": "hashicorp/consul/aws",
      "version": "0.1.0"
    },
    "consul_new": {
      "version": "0.12.0",
      "source": "hashicorp/consul/aws"
    }
  }
}
`
	want := map[string]int{
		"required_providers.aws": 5,
		"consul_old":             11,
		"consul_new":             16,
	}

	got := Find([]byte(contents), "main.tf.json")

	if !reflect.DeepEqual(got, want) {
		t.Fatalf("got %v, want %v", got, want)
	}
}

func TestFindKeepsWhatParsesInABrokenFile(t *testing.T) {
	contents := `module "vpc" {
  source = "terraform-aws-modules/vpc/aws"
}

module "broken" {
  source =
`

	got := Find([]byte(contents), "main.tf")

	if got["vpc"] != 2 {
		t.Fatalf("got %v, want vpc on line 2", got)
	}
}

func TestFindUsesTheFirstModuleOfAName(t *testing.T) {
	contents := `module "vpc" {
  source = "a/b/c"
}

module "vpc" {
  source = "d/e/f"
}
`

	got := Find([]byte(contents), "main.tf")

	if got["vpc"] != 2 {
		t.Fatalf("got %v, want vpc on line 2", got)
	}
}
