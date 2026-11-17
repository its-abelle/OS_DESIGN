# Ubuntu host and optional VM setup

## Existing Ubuntu installation

The application runs on the group's native Ubuntu installation. Docker hosts
Nginx, Apache/PHP, MySQL, MinIO and the cleanup worker. The separate VM procedure
below describes an Ubuntu guest deployment of the same stack.

Record the actual host details for the report:

```bash
cat /etc/os-release
uname -m
systemd-detect-virt
hostname -I
```

Use Ubuntu Terminal for commands and a browser for the GUI. For a remote Ubuntu
machine, SSH provides the terminal interface; the browser uses its IP address.

## Install Docker when needed

If `docker version` and `docker compose version` already work, keep that working
installation. Otherwise follow [Docker's official Ubuntu installation guide](https://docs.docker.com/engine/install/ubuntu/),
including its prerequisite checks for conflicting packages. The repository route
is preferable to mixing Ubuntu's Docker packages with Docker's own packages.

```bash
sudo apt update
sudo apt install -y ca-certificates curl git python3
sudo install -m 0755 -d /etc/apt/keyrings
sudo curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
sudo chmod a+r /etc/apt/keyrings/docker.asc
```

Create `/etc/apt/sources.list.d/docker.sources` using `sudo tee`:

```bash
sudo tee /etc/apt/sources.list.d/docker.sources <<EOF
Types: deb
URIs: https://download.docker.com/linux/ubuntu
Suites: $(. /etc/os-release && echo "${UBUNTU_CODENAME:-$VERSION_CODENAME}")
Components: stable
Architectures: $(dpkg --print-architecture)
Signed-By: /etc/apt/keyrings/docker.asc
EOF
sudo apt update
sudo apt install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
sudo systemctl enable --now docker
sudo docker run --rm hello-world
sudo docker compose version
```

Use `sudo docker ...` consistently if the account lacks socket access, or choose
to add your trusted development account to the `docker` group and log in again:

```bash
sudo usermod -aG docker "$USER"
```

Membership grants administrative control through Docker. Once access works,
follow the setup procedure in the root README.

## Ubuntu guest VM procedure

An Ubuntu host can also run a separate Ubuntu guest VM. This section is a setup
procedure; the deployment described in the report uses native Ubuntu. Ubuntu provides an official [VirtualBox walkthrough](https://ubuntu.com/tutorials/how-to-run-ubuntu-desktop-on-a-virtual-machine-using-virtualbox).

1. Enable hardware virtualisation in firmware if needed. Install VirtualBox
   following its instructions for the host OS, and download a supported Ubuntu
   LTS desktop ISO from [Ubuntu](https://ubuntu.com/download/desktop).
2. Create a VM named `COSC428-Ubuntu`. Our suggested starting allocation is
   2–4 virtual CPUs, 4–8 GB RAM, and a 40 GB dynamically allocated disk. Adjust
   these to leave sufficient memory and storage for the physical host.
3. Attach the ISO, install Ubuntu, create the group's account and log in.
4. Open the guest terminal, update its packages and install Docker using the
   host instructions above **inside the guest**.
5. Clone the repository inside the guest, configure `.env`, and start Compose.
   Running Docker only on the physical host does not demonstrate the guest stack.
6. Open `http://localhost:8080` in the guest browser. This is the simplest access
   method because its storage link `http://localhost:9100` also reaches the guest.
7. Capture VM settings, guest login, guest Ubuntu version, Docker services,
   application GUI, and a MySQL record that matches a successful upload.
8. Save a VM snapshot after the verified setup for demonstration recovery.

## Access from outside the guest

For NAT networking, forward host TCP 8080 to guest TCP 8080 and host TCP 9100 to
guest TCP 9100 in VirtualBox's network settings. Open `http://localhost:8080` in
the physical host's browser. Keep `S3_PUBLIC_ENDPOINT=http://localhost:9100`
for that browser. Host ports must be available; choose another host port and
update the browser URL or public storage endpoint if needed.

For bridged networking, find the guest address using `hostname -I`. Set
`S3_PUBLIC_ENDPOINT=http://<guest-IP>:9100`, recreate backend, cleanup and frontend, and browse
`http://<guest-IP>:8080`. Optional SSH uses guest port 22 (or NAT host 2222 → guest
22) after installing `openssh-server`. Do not publish MySQL port 3306.

The MinIO console is bound to guest loopback. Use the guest browser or an SSH
tunnel if administration from the physical host is needed. It is not needed for
the application demonstration.

## Linked environments

```text
Physical host → VM guest Ubuntu → Docker bridge network
Browser → Nginx → Apache/PHP → MySQL
                          └→ MinIO → browser signed download
```

For direct Ubuntu hosting, omit the VM layer and describe that accurately in the
report. Capture guest-specific evidence when presenting a VM deployment.
