variable "subscription_id" {
  description = "Azure subscription to deploy into."
  type        = string
  validation {
    condition     = can(regex("^[0-9a-fA-F-]{36}$", var.subscription_id))
    error_message = "Set subscription_id to your Azure subscription UUID."
  }
}

variable "location" {
  description = "An Azure region allowed by your subscription policy."
  type        = string
  default     = "southafricanorth"
}

variable "vm_size" {
  description = "An eligible x86 VM size; Standard_B2als_v2 has 2 vCPUs and 4 GB RAM."
  type        = string
  default     = "Standard_B2als_v2"
}

variable "ssh_public_key_path" {
  description = "Path to your existing SSH public key. The private key stays on your computer."
  type        = string
  default     = "~/.ssh/os_design_azure.pub"
}

variable "ssh_source_cidr" {
  description = "Your public IPv4 address with /32; only this address may connect to SSH."
  type        = string
  validation {
    condition     = can(cidrnetmask(var.ssh_source_cidr)) && endswith(var.ssh_source_cidr, "/32")
    error_message = "Use your public IPv4 address followed by /32."
  }
}

variable "source_revision" {
  description = "Full commit SHA from the public its-abelle/OS_DESIGN repository."
  type        = string
  default     = "87c3dfc525f17a1d7f6b974818e8632cd2a68ae8"
  validation {
    condition     = can(regex("^[0-9a-f]{40}$", var.source_revision))
    error_message = "Use a full lowercase 40-character Git commit SHA."
  }
}
