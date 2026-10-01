package declarations

import (
	"reflect"
	"testing"
)

func TestRead(t *testing.T) {
	tests := []struct {
		name     string
		fileName string
		contents string
		want     []Declaration
	}{
		{
			name:     "module with a source and version",
			fileName: "main.tf",
			contents: `module "vpc" {
  source  = "a/b/c"
  version = "~> 6.0"
  cidr    = "x"
}
`,
			want: []Declaration{
				{Name: "vpc", Block: BlockModule, Source: "a/b/c", Written: "a/b/c", Resolved: true, Version: "~> 6.0", Line: 2},
			},
		},
		{
			name:     "module version that is not a literal string",
			fileName: "main.tf",
			contents: `module "a" {
  source  = "a/b/c"
  version = 5
}

module "b" {
  source  = "d/e/f"
  version = var.v
}
`,
			want: []Declaration{
				{Name: "a", Block: BlockModule, Source: "a/b/c", Written: "a/b/c", Resolved: true, Line: 2},
				{Name: "b", Block: BlockModule, Source: "d/e/f", Written: "d/e/f", Resolved: true, Line: 7},
			},
		},
		{
			name:     "module whose source is not a string or names nothing in the file",
			fileName: "main.tf",
			contents: `module "a" {
  source = { ref = "x" }
}

module "b" {
  Source = "a/b/c"
}

module "c" {
  source = var.s
}

module "d" {
  cidr = "x"
}
`,
			want: []Declaration{
				{Name: "a", Block: BlockModule, Source: `{ ref = "x" }`, Written: `{ ref = "x" }`, Line: 2},
				{Name: "c", Block: BlockModule, Source: "var.s", Written: "var.s", Line: 10},
			},
		},
		{
			name:     "blocks in the order the file writes them",
			fileName: "main.tf",
			contents: `module "zebra" {
  source = "z/z/z"
}

terraform {
  source = "t/t/t"
}

module "apple" {
  source = "a/a/a"
}
`,
			want: []Declaration{
				{Name: "zebra", Block: BlockModule, Source: "z/z/z", Written: "z/z/z", Resolved: true, Line: 2},
				{Name: "terraform", Block: BlockTerraform, Source: "t/t/t", Written: "t/t/t", Resolved: true, Line: 6},
				{Name: "apple", Block: BlockModule, Source: "a/a/a", Written: "a/a/a", Resolved: true, Line: 10},
			},
		},
		{
			name:     "two modules with one name",
			fileName: "main.tf",
			contents: `module "vpc" {
  source = "a/b/c"
}

module "vpc" {
  source = "d/e/f"
}
`,
			want: []Declaration{
				{Name: "vpc", Block: BlockModule, Source: "a/b/c", Written: "a/b/c", Resolved: true, Line: 2},
			},
		},
		{
			name:     "two modules with one source",
			fileName: "main.tf",
			contents: `module "consul_old" {
  source  = "hashicorp/consul/aws"
  version = "0.1.0"
}

module "consul_new" {
  version = "0.11.0"

  source = "hashicorp/consul/aws"
}
`,
			want: []Declaration{
				{Name: "consul_old", Block: BlockModule, Source: "hashicorp/consul/aws", Written: "hashicorp/consul/aws", Resolved: true, Version: "0.1.0", Line: 2},
				{Name: "consul_new", Block: BlockModule, Source: "hashicorp/consul/aws", Written: "hashicorp/consul/aws", Resolved: true, Version: "0.11.0", Line: 9},
			},
		},
		{
			name:     "required providers",
			fileName: "main.tf",
			contents: `terraform {
  required_providers {
    google = { source = "hashicorp/google" }
    aws = {
      source  = "hashicorp/aws"
      version = ">= 5.0"
    }
  }
}
`,
			want: []Declaration{
				{Name: "required_providers.google", Block: BlockRequiredProviders, Source: "hashicorp/google", Written: "hashicorp/google", Resolved: true, Line: 3},
				{Name: "required_providers.aws", Block: BlockRequiredProviders, Source: "hashicorp/aws", Written: "hashicorp/aws", Resolved: true, Version: ">= 5.0", Line: 5},
			},
		},
		{
			name:     "required providers that are not the right shape",
			fileName: "main.tf",
			contents: `terraform {
  source = 42

  required_providers {
    aws     = { source = 1 }
    google  = "x"
    azurerm = { source = "hashicorp/azurerm", version = 4 }
  }
}
`,
			want: []Declaration{
				{Name: "required_providers.azurerm", Block: BlockRequiredProviders, Source: "hashicorp/azurerm", Written: "hashicorp/azurerm", Resolved: true, Line: 7},
			},
		},
		{
			name:     "only the first required_providers block of a terraform block",
			fileName: "main.tf",
			contents: `terraform {
  required_providers {
    aws = { source = "hashicorp/aws" }
  }
  required_providers {
    google = { source = "hashicorp/google" }
  }
}
`,
			want: []Declaration{
				{Name: "required_providers.aws", Block: BlockRequiredProviders, Source: "hashicorp/aws", Written: "hashicorp/aws", Resolved: true, Line: 3},
			},
		},
		{
			name:     "a provider in two terraform blocks",
			fileName: "main.tf",
			contents: `terraform {
  required_providers {
    aws = { source = "hashicorp/aws", version = "~> 5.0" }
  }
}

module "vpc" {
  source = "a/b/c"
}

terraform {
  required_providers {
    aws = { source = "hashicorp/aws", version = "~> 6.0" }
  }
}
`,
			want: []Declaration{
				{Name: "required_providers.aws", Block: BlockRequiredProviders, Source: "hashicorp/aws", Written: "hashicorp/aws", Resolved: true, Version: "~> 6.0", Line: 13},
				{Name: "vpc", Block: BlockModule, Source: "a/b/c", Written: "a/b/c", Resolved: true, Line: 8},
			},
		},
		{
			name:     "json module written as an object",
			fileName: "main.tf.json",
			contents: `{
  "module": {
    "vpc": { "source": "a/b/c", "version": "1.0.0" }
  }
}`,
			want: []Declaration{
				{Name: "vpc", Block: BlockModule, Source: "a/b/c", Written: "a/b/c", Resolved: true, Version: "1.0.0", Line: 3},
			},
		},
		{
			name:     "json module written as an array",
			fileName: "main.tf.json",
			contents: `{
  "module": {
    "vpc": [
      { "source": "a/b/c" }
    ]
  }
}`,
			want: []Declaration{
				{Name: "vpc", Block: BlockModule, Source: "a/b/c", Written: "a/b/c", Resolved: true, Line: 4},
			},
		},
		{
			name:     "json required providers written as an object",
			fileName: "main.tf.json",
			contents: `{
  "terraform": {
    "required_providers": {
      "aws": {
        "source": "hashicorp/aws"
      }
    }
  }
}`,
			want: []Declaration{
				{Name: "required_providers.aws", Block: BlockRequiredProviders, Source: "hashicorp/aws", Written: "hashicorp/aws", Resolved: true, Line: 5},
			},
		},
		{
			name:     "json with neither block",
			fileName: "main.tf.json",
			contents: `{ "variable": { "x": {} } }`,
			want:     nil,
		},
		{
			name:     "json interpolated version",
			fileName: "main.tf.json",
			contents: `{ "module": { "vpc": { "source": "a/b/c", "version": "${var.v}" } } }`,
			want: []Declaration{
				{Name: "vpc", Block: BlockModule, Source: "a/b/c", Written: "a/b/c", Resolved: true, Line: 1},
			},
		},
		{
			name:     "opentofu source built from locals",
			fileName: "main.tofu",
			contents: `locals {
  repo = "github.com/org/modules"
  ref  = "?ref=v1.2.0"
}

module "storage" {
  source = "${local.repo}//storage${local.ref}"
}
`,
			want: []Declaration{
				{Name: "storage", Block: BlockModule, Source: "github.com/org/modules//storage?ref=v1.2.0", Written: "${local.repo}//storage${local.ref}", Resolved: true, Line: 7},
			},
		},
		{
			name:     "opentofu version from a variable default",
			fileName: "main.tf",
			contents: `variable "vpc_version" {
  default = "6.7.3"
}

module "vpc" {
  source  = "terraform-aws-modules/vpc/aws"
  version = var.vpc_version
}
`,
			want: []Declaration{
				{Name: "vpc", Block: BlockModule, Source: "terraform-aws-modules/vpc/aws", Written: "terraform-aws-modules/vpc/aws", Resolved: true, Version: "6.7.3", Line: 6},
			},
		},
		{
			name:     "opentofu locals that refer to locals written after them",
			fileName: "main.tf",
			contents: `locals {
  source = "${local.host}/${local.path}"
}

locals {
  host = "github.com/${var.org}"
  path = "modules"
}

variable "org" {
  default = "acme"
}

module "m" {
  source = local.source
}
`,
			want: []Declaration{
				{Name: "m", Block: BlockModule, Source: "github.com/acme/modules", Written: "local.source", Resolved: true, Line: 15},
			},
		},
		{
			name:     "opentofu sources the file cannot evaluate",
			fileName: "main.tf",
			contents: `variable "no_default" {}

locals {
  repo = "github.com/org/modules"
  id   = aws_vpc.main.id
}

module "no_default" {
  source = "${var.no_default}//vpc"
}

module "function_call" {
  source = format("%s//vpc", local.repo)
}

module "resource" {
  source  = "github.com/org/${local.id}"
  version = var.no_default
}
`,
			want: []Declaration{
				{Name: "no_default", Block: BlockModule, Source: "${var.no_default}//vpc", Written: "${var.no_default}//vpc", Line: 9},
				{Name: "function_call", Block: BlockModule, Source: `format("%s//vpc", local.repo)`, Written: `format("%s//vpc", local.repo)`, Line: 13},
				{Name: "resource", Block: BlockModule, Source: "github.com/org/${local.id}", Written: "github.com/org/${local.id}", Line: 17},
			},
		},
		{
			name:     "opentofu json source and version from locals and variables",
			fileName: "main.tf.json",
			contents: `{
  "variable": { "vpc_version": { "default": "6.7.3" } },
  "locals": { "registry": "terraform-aws-modules" },
  "module": {
    "vpc": { "source": "${local.registry}/vpc/aws", "version": "${var.vpc_version}" }
  }
}`,
			want: []Declaration{
				{Name: "vpc", Block: BlockModule, Source: "terraform-aws-modules/vpc/aws", Written: "${local.registry}/vpc/aws", Resolved: true, Version: "6.7.3", Line: 5},
			},
		},
		{
			name:     "provider source from a variable, which neither language allows",
			fileName: "main.tf",
			contents: `variable "ns" {
  default = "hashicorp"
}

terraform {
  required_providers {
    aws = { source = "${var.ns}/aws" }
  }
}
`,
			want: nil,
		},
		{
			name:     "opentofu locals that refer to each other in a cycle",
			fileName: "main.tf",
			contents: `locals {
  a = local.b
  b = "${local.a}/x"
}

module "m" {
  source = local.a
}
`,
			want: []Declaration{
				{Name: "m", Block: BlockModule, Source: "local.a", Written: "local.a", Line: 7},
			},
		},
		{
			name:     "opentofu template with a string inside its interpolation",
			fileName: "main.tf",
			contents: `variable "env" {
  default = "prod"
}

module "m" {
  source = "${var.env == "prod" ? "a/b" : "c/d"}/aws"
}
`,
			want: []Declaration{
				{Name: "m", Block: BlockModule, Source: "a/b/aws", Written: `${var.env == "prod" ? "a/b" : "c/d"}/aws`, Resolved: true, Line: 6},
			},
		},
		{
			name:     "opentofu json template with an escaped quote",
			fileName: "main.tf.json",
			contents: `{
  "locals": { "m": { "vpc": "terraform-aws-modules" } },
  "module": { "vpc": { "source": "${local.m[\"vpc\"]}/vpc/aws" } }
}`,
			want: []Declaration{
				{Name: "vpc", Block: BlockModule, Source: "terraform-aws-modules/vpc/aws", Written: `${local.m[\"vpc\"]}/vpc/aws`, Resolved: true, Line: 3},
			},
		},
		{
			name:     "opentofu chain of locals written in reverse",
			fileName: "main.tf",
			contents: `locals {
  c300 = local.c299
  c299 = local.c298
  c298 = local.c297
  c297 = local.c296
  c296 = local.c295
  c295 = local.c294
  c294 = local.c293
  c293 = local.c292
  c292 = local.c291
  c291 = local.c290
  c290 = local.c289
  c289 = local.c288
  c288 = local.c287
  c287 = local.c286
  c286 = local.c285
  c285 = local.c284
  c284 = local.c283
  c283 = local.c282
  c282 = local.c281
  c281 = local.c280
  c280 = local.c279
  c279 = local.c278
  c278 = local.c277
  c277 = local.c276
  c276 = local.c275
  c275 = local.c274
  c274 = local.c273
  c273 = local.c272
  c272 = local.c271
  c271 = local.c270
  c270 = local.c269
  c269 = local.c268
  c268 = local.c267
  c267 = local.c266
  c266 = local.c265
  c265 = local.c264
  c264 = local.c263
  c263 = local.c262
  c262 = local.c261
  c261 = local.c260
  c260 = local.c259
  c259 = local.c258
  c258 = local.c257
  c257 = local.c256
  c256 = local.c255
  c255 = local.c254
  c254 = local.c253
  c253 = local.c252
  c252 = local.c251
  c251 = local.c250
  c250 = local.c249
  c249 = local.c248
  c248 = local.c247
  c247 = local.c246
  c246 = local.c245
  c245 = local.c244
  c244 = local.c243
  c243 = local.c242
  c242 = local.c241
  c241 = local.c240
  c240 = local.c239
  c239 = local.c238
  c238 = local.c237
  c237 = local.c236
  c236 = local.c235
  c235 = local.c234
  c234 = local.c233
  c233 = local.c232
  c232 = local.c231
  c231 = local.c230
  c230 = local.c229
  c229 = local.c228
  c228 = local.c227
  c227 = local.c226
  c226 = local.c225
  c225 = local.c224
  c224 = local.c223
  c223 = local.c222
  c222 = local.c221
  c221 = local.c220
  c220 = local.c219
  c219 = local.c218
  c218 = local.c217
  c217 = local.c216
  c216 = local.c215
  c215 = local.c214
  c214 = local.c213
  c213 = local.c212
  c212 = local.c211
  c211 = local.c210
  c210 = local.c209
  c209 = local.c208
  c208 = local.c207
  c207 = local.c206
  c206 = local.c205
  c205 = local.c204
  c204 = local.c203
  c203 = local.c202
  c202 = local.c201
  c201 = local.c200
  c200 = local.c199
  c199 = local.c198
  c198 = local.c197
  c197 = local.c196
  c196 = local.c195
  c195 = local.c194
  c194 = local.c193
  c193 = local.c192
  c192 = local.c191
  c191 = local.c190
  c190 = local.c189
  c189 = local.c188
  c188 = local.c187
  c187 = local.c186
  c186 = local.c185
  c185 = local.c184
  c184 = local.c183
  c183 = local.c182
  c182 = local.c181
  c181 = local.c180
  c180 = local.c179
  c179 = local.c178
  c178 = local.c177
  c177 = local.c176
  c176 = local.c175
  c175 = local.c174
  c174 = local.c173
  c173 = local.c172
  c172 = local.c171
  c171 = local.c170
  c170 = local.c169
  c169 = local.c168
  c168 = local.c167
  c167 = local.c166
  c166 = local.c165
  c165 = local.c164
  c164 = local.c163
  c163 = local.c162
  c162 = local.c161
  c161 = local.c160
  c160 = local.c159
  c159 = local.c158
  c158 = local.c157
  c157 = local.c156
  c156 = local.c155
  c155 = local.c154
  c154 = local.c153
  c153 = local.c152
  c152 = local.c151
  c151 = local.c150
  c150 = local.c149
  c149 = local.c148
  c148 = local.c147
  c147 = local.c146
  c146 = local.c145
  c145 = local.c144
  c144 = local.c143
  c143 = local.c142
  c142 = local.c141
  c141 = local.c140
  c140 = local.c139
  c139 = local.c138
  c138 = local.c137
  c137 = local.c136
  c136 = local.c135
  c135 = local.c134
  c134 = local.c133
  c133 = local.c132
  c132 = local.c131
  c131 = local.c130
  c130 = local.c129
  c129 = local.c128
  c128 = local.c127
  c127 = local.c126
  c126 = local.c125
  c125 = local.c124
  c124 = local.c123
  c123 = local.c122
  c122 = local.c121
  c121 = local.c120
  c120 = local.c119
  c119 = local.c118
  c118 = local.c117
  c117 = local.c116
  c116 = local.c115
  c115 = local.c114
  c114 = local.c113
  c113 = local.c112
  c112 = local.c111
  c111 = local.c110
  c110 = local.c109
  c109 = local.c108
  c108 = local.c107
  c107 = local.c106
  c106 = local.c105
  c105 = local.c104
  c104 = local.c103
  c103 = local.c102
  c102 = local.c101
  c101 = local.c100
  c100 = local.c99
  c99 = local.c98
  c98 = local.c97
  c97 = local.c96
  c96 = local.c95
  c95 = local.c94
  c94 = local.c93
  c93 = local.c92
  c92 = local.c91
  c91 = local.c90
  c90 = local.c89
  c89 = local.c88
  c88 = local.c87
  c87 = local.c86
  c86 = local.c85
  c85 = local.c84
  c84 = local.c83
  c83 = local.c82
  c82 = local.c81
  c81 = local.c80
  c80 = local.c79
  c79 = local.c78
  c78 = local.c77
  c77 = local.c76
  c76 = local.c75
  c75 = local.c74
  c74 = local.c73
  c73 = local.c72
  c72 = local.c71
  c71 = local.c70
  c70 = local.c69
  c69 = local.c68
  c68 = local.c67
  c67 = local.c66
  c66 = local.c65
  c65 = local.c64
  c64 = local.c63
  c63 = local.c62
  c62 = local.c61
  c61 = local.c60
  c60 = local.c59
  c59 = local.c58
  c58 = local.c57
  c57 = local.c56
  c56 = local.c55
  c55 = local.c54
  c54 = local.c53
  c53 = local.c52
  c52 = local.c51
  c51 = local.c50
  c50 = local.c49
  c49 = local.c48
  c48 = local.c47
  c47 = local.c46
  c46 = local.c45
  c45 = local.c44
  c44 = local.c43
  c43 = local.c42
  c42 = local.c41
  c41 = local.c40
  c40 = local.c39
  c39 = local.c38
  c38 = local.c37
  c37 = local.c36
  c36 = local.c35
  c35 = local.c34
  c34 = local.c33
  c33 = local.c32
  c32 = local.c31
  c31 = local.c30
  c30 = local.c29
  c29 = local.c28
  c28 = local.c27
  c27 = local.c26
  c26 = local.c25
  c25 = local.c24
  c24 = local.c23
  c23 = local.c22
  c22 = local.c21
  c21 = local.c20
  c20 = local.c19
  c19 = local.c18
  c18 = local.c17
  c17 = local.c16
  c16 = local.c15
  c15 = local.c14
  c14 = local.c13
  c13 = local.c12
  c12 = local.c11
  c11 = local.c10
  c10 = local.c9
  c9 = local.c8
  c8 = local.c7
  c7 = local.c6
  c6 = local.c5
  c5 = local.c4
  c4 = local.c3
  c3 = local.c2
  c2 = local.c1
  c1 = "terraform-aws-modules"
}

module "m" {
  source = "${local.c300}/vpc/aws"
}
`,
			want: []Declaration{
				{Name: "m", Block: BlockModule, Source: "terraform-aws-modules/vpc/aws", Written: "${local.c300}/vpc/aws", Resolved: true, Line: 305},
			},
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, err := Read([]byte(tt.contents), tt.fileName)
			if err != nil {
				t.Fatalf("Read: %v", err)
			}
			if !reflect.DeepEqual(got, tt.want) {
				t.Errorf("got  %+v\nwant %+v", got, tt.want)
			}
		})
	}
}

func TestReadError(t *testing.T) {
	tests := []struct {
		name     string
		fileName string
		contents string
	}{
		{name: "hcl that does not parse", fileName: "main.tf", contents: "module \"vpc\" {\n  source = \n"},
		{name: "json null", fileName: "main.tf.json", contents: "null"},
		{name: "text that is not json", fileName: "main.tf.json", contents: "not json"},
		{name: "json number", fileName: "main.tf.json", contents: "42"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if _, err := Read([]byte(tt.contents), tt.fileName); err == nil {
				t.Error("Read returned no error")
			}
		})
	}
}
