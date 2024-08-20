provider "aws" {
  region     = var.region
  access_key = var.aws_access_key
  secret_key = var.aws_secret_key
}

variable "aws_access_key" {
  type = string
}

variable "aws_secret_key" {
  type = string
}

variable "region" {
  type    = string
  default = "us-east-1"
}

variable "install_docker" {
  type    = bool
  default = false
}
variable "install_nginx" {
  type    = bool
  default = false
}
variable "install_node" {
  type    = bool
  default = false
}

variable "install_vscode" {
  type    = bool
  default = false
}

variable "ami_id" {
  type = string
}

module "vpc" {
  source  = "terraform-aws-modules/vpc/aws"
  version = "4.0.0"

  name = "my-vpc"
  cidr = "10.0.0.0/16"

  azs            = [format("%sa", var.region)]
  public_subnets = ["10.0.1.0/24"]

  enable_dns_hostnames = true
  enable_dns_support   = true

  map_public_ip_on_launch = true

  tags = {
    Terraform   = "true"
    Environment = "dev"
  }
}

resource "aws_security_group" "ec2_sg" {
  vpc_id = module.vpc.vpc_id

  ingress {
    from_port   = 22
    to_port     = 22
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  ingress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = {
    Name = "ec2-sg"
  }
}

resource "aws_key_pair" "my_key" {
  key_name   = "id_rsa"
  public_key = file("~/.ssh/id_rsa.pub")
}

locals {
  install_script = <<-EOF
    #!/bin/bash
    set -e
    
    # Update system
    sudo apt-get update
    sudo apt-get install -y curl

    %{ if var.install_docker }
    # Install Docker
    sudo apt-get install -y docker.io
    sudo systemctl start docker
    sudo systemctl enable docker
    sudo usermod -aG docker ubuntu
    %{ endif }

    %{ if var.install_node }
    # Install Node.js
    curl -fsSL https://deb.nodesource.com/setup_lts.x | sudo -E bash -
    sudo apt-get install -y nodejs
    %{ endif }

    %{ if var.install_nginx }
    # Install NGINX
    sudo apt-get install -y nginx-full
    sudo systemctl start nginx
    sudo systemctl enable nginx
    %{ endif }

    %{ if var.install_vscode }
    # Install VS Code Server
    curl -fsSL https://code-server.dev/install.sh | sudo sh
    
    # Configure VS Code Server
    sudo mkdir -p /home/ubuntu/.config/code-server
    sudo cat << EOT | sudo tee /home/ubuntu/.config/code-server/config.yaml
    bind-addr: 0.0.0.0:8080
    auth: password
    password: 105319
    cert: false
    EOT
    
    # Create systemd service file
    sudo tee /etc/systemd/system/code-server.service > /dev/null << EOT
    [Unit]
    Description=code-server
    After=network.target
    
    [Service]
    Type=simple
    User=ubuntu
    Environment="HOME=/home/ubuntu"
    ExecStart=/usr/bin/code-server --bind-addr 0.0.0.0:8080 --config /home/ubuntu/.config/code-server/config.yaml
    Restart=always
    WorkingDirectory=/home/ubuntu
    
    [Install]
    WantedBy=multi-user.target
    EOT
    
    # Set correct permissions
    sudo chown -R ubuntu:ubuntu /home/ubuntu/.config
    
    # Start and enable the service
    sudo systemctl daemon-reload
    sudo systemctl enable code-server
    sudo systemctl start code-server
    %{ endif }
    
    # Log installation results
    echo "Installation complete. Docker: ${var.install_docker}, Node.js: ${var.install_node}, NGINX: ${var.install_nginx}, VS Code Server: ${var.install_vscode}"
  EOF
}

resource "aws_instance" "example" {
  ami           = var.ami_id  # Ubuntu 22.04 LTS
  instance_type = "t2.micro"
  key_name      = aws_key_pair.my_key.key_name

  subnet_id                   = module.vpc.public_subnets[0]
  vpc_security_group_ids      = [aws_security_group.ec2_sg.id]
  associate_public_ip_address = true

  user_data                   = base64encode(local.install_script)
  user_data_replace_on_change = true

  tags = {
    Name = "VSCodeServerInstance"
  }
}

output "public_ip" {
  description = "The public IP of the EC2 instance"
  value       = aws_instance.example.public_ip
}

output "vscode_server_url" {
  description = "URL to access VS Code Server"
  value       = "http://${aws_instance.example.public_ip}:8080"
}