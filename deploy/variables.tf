variable "kubeconfig_path" {
  description = "Path to the kubeconfig file for MicroK8s"
  type        = string
  default     = "~/.kube/config"
}

variable "kubeconfig_context" {
  description = "Kubeconfig context for MicroK8s"
  type        = string
  default     = "microk8s"
}

variable "registry_host" {
  default = "localhost:32000"
}

variable "image_name" {
  default = "gridwatch"
}

variable "home" {
  description = "Home directory, used to locate the openf1 checkout (a separate repo, not colocated here)"
  default     = "/home/nat"
}

variable "gridwatch_admin_token" {
  description = "Admin token for Gridwatch"
  type        = string
  sensitive   = true
}

variable "f1tv_email" {
  description = "F1TV account email for token auto-refresh"
  type        = string
  sensitive   = true
}

variable "f1tv_password" {
  description = "F1TV account password for token auto-refresh"
  type        = string
  sensitive   = true
}
