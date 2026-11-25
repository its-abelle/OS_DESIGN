# Deploy the complete stack to Azure

This provisions one Ubuntu 24.04 x86 VM with the existing PHP/Apache, Nginx,
MySQL, MinIO and cleanup containers. Caddy adds automatic HTTPS. There are no
managed databases, storage accounts, container registries or external storage providers.

## Azure compatibility checked

Read-only checks on 2026-11-25 confirmed:

- The selected Azure for Students subscription is enabled.
- Its allowed regions are South Africa North, UAE North, Spain Central,
  Switzerland North and Austria East.
- `Standard_B2s` is blocked in South Africa North. The default here is
  `Standard_B2als_v2`: 2 vCPUs, 4 GB RAM, x64, with no subscription restriction
  reported by the SKU API in South Africa North.
- The public application repository and pinned source commit are available.
- Compute and Network providers are not registered. Registration is a one-time
  prerequisite below; it does not create a VM.

Azure supports this architecture. Actual VM allocation still depends on CPU
quota and regional capacity when you apply. The current unregistered Compute
provider returned an empty quota list, so available CPU quota is not yet confirmed.
A read-only Terraform plan against this subscription succeeded with eight resources
to add and none to change or destroy, using a test SSH public key and source IP.
The Terraform and bootstrap checks do not prove a live deployment succeeded.

`Standard_B2als_v2` is not the 1 GB free-tier VM. Compute, disk and public IPv4
usage can consume your student credit. Check remaining credit in Azure Education
Hub and the Azure pricing calculator before applying. Keep the student spending
limit enabled.

## Prepare

From the repository root, generate a dedicated SSH key if you do not already
have one at this path. Keep the private key on your computer.

```bash
ssh-keygen -t ed25519 -f "$HOME/.ssh/os_design_azure" -C os-design-azure
cd infra/azure
cp terraform.tfvars.example terraform.tfvars
```

Edit `terraform.tfvars`:

- Confirm `subscription_id` matches your student subscription.
- Set `ssh_source_cidr` to your current public IPv4 address followed by `/32`.
  Use your router's public address, not a LAN address such as `192.168.x.x`.
- Keep `southafricanorth` and `Standard_B2als_v2` unless you check another
  combination against your subscription's region policy, SKU eligibility and quota.
- Set `ssh_public_key_path` if using a different existing key.

The `.tfvars`, plan and state files are ignored by Git. Keep a safe copy of your
Terraform state; it is needed to manage and remove these resources later.

Sign in, choose the subscription, and register the two required providers:

```bash
az login --use-device-code
az account set --subscription "YOUR_STUDENT_SUBSCRIPTION_ID"
az provider register --namespace Microsoft.Compute --wait
az provider register --namespace Microsoft.Network --wait
```

Check quota **after registration**. The VM needs two available regional vCPUs
and two available `standardBasv2Family` vCPUs:

```bash
az vm list-usage --location southafricanorth \
  --query "[?name.value=='cores'||name.value=='standardBasv2Family'].{name:name.value,used:currentValue,limit:limit}" \
  --output table
```

If there are no matching rows or either remaining quota is below two, stop and
request quota or select another allowed region/eligible size. An unrestricted
SKU alone does not prove enough CPU quota is allocated.

## Review and deploy

```bash
terraform init
terraform fmt -check
terraform validate
terraform plan -out=azure.tfplan
terraform apply azure.tfplan
```

Review the plan before the apply. It should create only a resource group, virtual
network, subnet, network security group, public IP/DNS label, network interface,
its security-group association and one VM. Provider auto-registration is disabled
so `terraform plan` does not register subscription services.

The VM installs Docker/Compose, clones the public repository at the pinned
`source_revision`, generates three independent passwords on the VM, and starts
the stack. Passwords are kept in a root-only `.env` on the VM, not Terraform
variables or state. Existing passwords are preserved if setup is rerun.

Azure can mark the VM ready before cloud-init finishes installing and building
the app. Allow several minutes, then use the SSH command printed by Terraform:

```bash
terraform output ssh_command
terraform output app_url
```

Run the printed SSH command, then inside the VM:

```bash
sudo cloud-init status --wait
sudo tail -n 80 /var/log/cloud-init-output.log
sudo sh -c 'cd /opt/department-of-files && docker compose -f compose.yaml -f compose.azure.yaml ps'
```

Open the HTTPS `app_url`. Upload and collect a small PDF to verify browser-to-storage
connectivity. Storage downloads use HTTPS on port **9443** of the same hostname;
this avoids needing another domain or public IP and preserves S3 signatures.

Only 80, 443 and 9443 are public. SSH is limited to your `/32`; update it and apply
again if your public IP changes. MySQL, raw Nginx/MinIO ports, and the MinIO console
are not published. Caddy keeps certificate data in a Docker volume.

If bootstrap failed, inspect its log and rerun on the VM after fixing the cause:

```bash
sudo bash /usr/local/sbin/setup-department-files
```

This reruns setup at the pinned revision; do not use it to update application code.

The application is a **fresh cloud instance**. Local Docker accounts and PDFs
are not copied to Azure.

## Data, updates and cleanup

Docker volumes and `.env` live on the VM's persistent OS disk. They survive a
reboot or deallocation, but **VM replacement or `terraform destroy` deletes the
disk and its database, PDFs, credentials and TLS state**. Back up data before
changing `source_revision`, bootstrap files, location, SSH key or any plan that
shows `-/+` for the VM. Do not use VM replacement as an application-update method.

To update application code without replacing the VM, back up first, SSH in and
run `git fetch` / `git checkout <reviewed-commit>` in `/opt/department-of-files`,
then rebuild using the two Compose files. Keep `.env` and the volumes. Use a
reviewed commit whose deployment configuration is compatible with this setup.

To remove the deployment once data is no longer needed:

```bash
terraform plan -destroy
terraform destroy
```

Deallocating the VM pauses its compute usage; the disk and public IP can continue
to consume credit until removed. This setup does not enable paid automatic backups.
The application's existing one-time collection behavior remains unchanged.

## Local verification without Azure deployment

```bash
terraform fmt -check -recursive
terraform validate
terraform test
python3 tests/check_bootstrap.py
```

Terraform tests use a mocked Azure provider and a public test SSH key. They do not
create Azure resources. The Python check renders and syntax-checks the bootstrap
and validates the merged production Compose configuration using dummy credentials.
