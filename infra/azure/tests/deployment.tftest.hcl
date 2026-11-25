mock_provider "azurerm" {}

override_resource {
  target          = azurerm_public_ip.app
  override_during = plan
  values = {
    fqdn       = "department-files-test.southafricanorth.cloudapp.azure.com"
    ip_address = "203.0.113.10"
  }
}

variables {
  subscription_id     = "00000000-0000-0000-0000-000000000000"
  ssh_public_key_path = "tests/fixtures/id_ed25519.pub"
  ssh_source_cidr     = "203.0.113.10/32"
}

run "single_vm_private_services" {
  command = plan

  assert {
    condition     = azurerm_linux_virtual_machine.app.disable_password_authentication
    error_message = "The VM must require an SSH key."
  }
  assert {
    condition = alltrue([
      for rule in azurerm_network_security_group.app.security_rule :
      rule.destination_port_range != "22" || rule.source_address_prefix == "203.0.113.10/32"
    ])
    error_message = "SSH must be limited to the operator's IP."
  }
  assert {
    condition = alltrue([
      for rule in azurerm_network_security_group.app.security_rule :
      rule.source_address_prefix != "*" || toset(rule.destination_port_ranges) == toset(["80", "443", "9443"])
    ])
    error_message = "Only the HTTPS proxy and its certificate-validation port may be public."
  }
  assert {
    condition     = length(base64decode(azurerm_linux_virtual_machine.app.custom_data)) < 65536
    error_message = "Cloud-init data must fit Azure's custom-data limit."
  }
}

run "reject_public_ssh" {
  command = plan
  variables {
    ssh_source_cidr = "0.0.0.0/0"
  }
  expect_failures = [var.ssh_source_cidr]
}
