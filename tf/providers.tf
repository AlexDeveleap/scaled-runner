locals {
  aws_region = "us-east-2"
}

provider "aws" {
  region = local.aws_region
}
