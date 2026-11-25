locals {
  name = "department-files-${substr(sha256(var.subscription_id), 0, 8)}"
  tags = { project = "OS_DESIGN" }
}

resource "azurerm_resource_group" "app" {
  name     = local.name
  location = var.location
  tags     = local.tags
}

resource "azurerm_virtual_network" "app" {
  name                = local.name
  location            = azurerm_resource_group.app.location
  resource_group_name = azurerm_resource_group.app.name
  address_space       = ["10.42.0.0/16"]
  tags                = local.tags
}

resource "azurerm_subnet" "app" {
  name                 = "app"
  resource_group_name  = azurerm_resource_group.app.name
  virtual_network_name = azurerm_virtual_network.app.name
  address_prefixes     = ["10.42.1.0/24"]
}

resource "azurerm_network_security_group" "app" {
  name                = local.name
  location            = azurerm_resource_group.app.location
  resource_group_name = azurerm_resource_group.app.name
  tags                = local.tags

  security_rule {
    name                       = "SSH-from-your-IP"
    priority                   = 100
    direction                  = "Inbound"
    access                     = "Allow"
    protocol                   = "Tcp"
    source_port_range          = "*"
    destination_port_range     = "22"
    source_address_prefix      = var.ssh_source_cidr
    destination_address_prefix = "*"
  }
  security_rule {
    name                       = "HTTPS-and-certificate-validation"
    priority                   = 110
    direction                  = "Inbound"
    access                     = "Allow"
    protocol                   = "Tcp"
    source_port_range          = "*"
    destination_port_ranges    = ["80", "443", "9443"]
    source_address_prefix      = "*"
    destination_address_prefix = "*"
  }
}

resource "azurerm_public_ip" "app" {
  name                = local.name
  location            = azurerm_resource_group.app.location
  resource_group_name = azurerm_resource_group.app.name
  allocation_method   = "Static"
  sku                 = "Standard"
  domain_name_label   = local.name
  tags                = local.tags
}

resource "azurerm_network_interface" "app" {
  name                = local.name
  location            = azurerm_resource_group.app.location
  resource_group_name = azurerm_resource_group.app.name
  tags                = local.tags

  ip_configuration {
    name                          = "app"
    subnet_id                     = azurerm_subnet.app.id
    private_ip_address_allocation = "Dynamic"
    public_ip_address_id          = azurerm_public_ip.app.id
  }
}

resource "azurerm_network_interface_security_group_association" "app" {
  network_interface_id      = azurerm_network_interface.app.id
  network_security_group_id = azurerm_network_security_group.app.id
}

resource "azurerm_linux_virtual_machine" "app" {
  name                            = local.name
  location                        = azurerm_resource_group.app.location
  resource_group_name             = azurerm_resource_group.app.name
  size                            = var.vm_size
  admin_username                  = "azureuser"
  disable_password_authentication = true
  network_interface_ids           = [azurerm_network_interface.app.id]
  tags                            = local.tags

  admin_ssh_key {
    username   = "azureuser"
    public_key = file(pathexpand(var.ssh_public_key_path))
  }
  os_disk {
    caching              = "ReadWrite"
    storage_account_type = "Standard_LRS"
    disk_size_gb         = 32
  }
  source_image_reference {
    publisher = "Canonical"
    offer     = "ubuntu-24_04-lts"
    sku       = "server"
    version   = "latest"
  }
  custom_data = base64encode(templatefile("${path.module}/cloud-init.yaml.tftpl", {
    bootstrap = base64encode(templatefile("${path.module}/bootstrap.sh.tftpl", {
      app_host        = azurerm_public_ip.app.fqdn
      source_revision = var.source_revision
      compose         = file("${path.module}/compose.azure.yaml")
      caddyfile       = file("${path.module}/Caddyfile")
    }))
  }))

  depends_on = [
    azurerm_network_interface_security_group_association.app,
  ]
}
