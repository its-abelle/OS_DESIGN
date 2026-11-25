output "app_url" {
  description = "Open after cloud-init finishes."
  value       = "https://${azurerm_public_ip.app.fqdn}"
}
output "storage_url" {
  description = "Private S3 API; downloads use short-lived signed links on this endpoint."
  value       = "https://${azurerm_public_ip.app.fqdn}:9443"
}
output "public_ip" {
  value = azurerm_public_ip.app.ip_address
}
output "ssh_command" {
  value = "ssh -i ${trimsuffix(pathexpand(var.ssh_public_key_path), ".pub")} azureuser@${azurerm_public_ip.app.fqdn}"
}
output "resource_group" {
  value = azurerm_resource_group.app.name
}
