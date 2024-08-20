const express = require('express');
const path = require('path');
const { exec } = require('child_process');
const fs = require('fs');

const app = express();
app.use(express.json());

// Serve static files from the "public" directory
app.use(express.static(path.join(__dirname, 'public')));

let deploymentStatus = null;

app.post('/deploy', (req, res) => {
    const {
        awsAccessKey,
        awsSecretKey,
        region,
        amiId,
        installDocker = false,
        installNode = false,
        installVSCode = false,
        installNginx = false
    } = req.body;

    // Ensure the values are boolean and convert them to proper format for Terraform
    const docker = installDocker === 'true' || installDocker === true ? 'true' : 'false';
    const node = installNode === 'true' || installNode === true ? 'true' : 'false';
    const vscode = installVSCode === 'true' || installVSCode === true ? 'true' : 'false';
    const nginx = installNginx === 'true' || installNginx === true ? 'true' : 'false';

    if (!awsAccessKey || !awsSecretKey || !region || !amiId) {
        return res.status(400).json({ error: 'AWS credentials, region, and AMI ID are required' });
    }

    console.log('Setting AWS credentials:');
    console.log(`Access Key: ${awsAccessKey.substring(0, 5)}...`);
    console.log(`Secret Key: ${awsSecretKey.substring(0, 5)}...`);
    console.log(`Region: ${region}`);
    console.log(`AMI ID: ${amiId}`);
    console.log(`Install Docker: ${docker}`);
    console.log(`Install Node.js: ${node}`);
    console.log(`Install NGINX: ${nginx}`);
    console.log(`Install VS Code Server: ${vscode}`);

    process.env.AWS_ACCESS_KEY_ID = awsAccessKey;
    process.env.AWS_SECRET_ACCESS_KEY = awsSecretKey;
    process.env.AWS_DEFAULT_REGION = region;

    const terraformDir = path.join(__dirname, '../terraform');
    process.chdir(terraformDir);

    deploymentStatus = { status: 'initializing' };

    exec('terraform init', { env: process.env }, (initError, initStdout, initStderr) => {
        if (initError) {
            console.error('Terraform init error:', initError);
            console.error('Terraform init stderr:', initStderr);
            deploymentStatus = { status: 'error', error: 'Error initializing Terraform' };
            return;
        }
    
        console.log('Terraform init output:', initStdout);
        deploymentStatus = { status: 'applying' };
    
        exec(`terraform apply -auto-approve -var="aws_access_key=${awsAccessKey}" -var="aws_secret_key=${awsSecretKey}" -var="region=${region}" -var="ami_id=${amiId}" -var="install_docker=${docker}" -var="install_node=${node}" -var="install_nginx=${nginx}" -var="install_vscode=${vscode}"`, { env: process.env }, (applyError, applyStdout, applyStderr) => {
            if (applyError) {
                console.error('Terraform apply error:', applyError);
                console.error('Terraform apply stderr:', applyStderr);
                deploymentStatus = { status: 'error', error: 'Error deploying instance on AWS' };
                return;
            }
        
            console.log('Terraform apply output:', applyStdout);
            deploymentStatus = { status: 'retrieving_ip' };
        
            const getOutput = () => {
                exec('terraform output -json', { env: process.env }, (outputError, outputStdout, outputStderr) => {
                    if (outputError) {
                        console.error('Terraform output error:', outputError);
                        console.error('Terraform output stderr:', outputStderr);
                        setTimeout(getOutput, 10000);  // Retry after 10 seconds
                        return;
                    }
    
                    try {
                        console.log('Raw Terraform output:', outputStdout);
                        const output = JSON.parse(outputStdout);
                        console.log('Parsed Terraform output:', JSON.stringify(output, null, 2));
                        const publicIp = output.public_ip ? output.public_ip.value : null;
                        const vscodeServerUrl = output.vscode_server_url ? output.vscode_server_url.value : null;
        
                        if (publicIp && publicIp !== 'N/A') {
                            console.log(`Public IP retrieved successfully: ${publicIp}`);
                            deploymentStatus = { 
                                status: 'completed',
                                publicIp,
                                vscodeServerUrl,
                                message: 'Instance deployed successfully'
                            };
                        } else {
                            setTimeout(getOutput, 10000);  // Retry after 10 seconds
                        }
                    } catch (parseError) {
                        console.error('Error parsing Terraform output:', parseError);
                        setTimeout(getOutput, 10000);  // Retry after 10 seconds
                    }
                });
            };
        
            getOutput();
        });
    });

    res.json({ message: 'Deployment started' });
});

app.get('/status', (req, res) => {
    res.json(deploymentStatus || { status: 'not_started' });
});

// Route to download the SSH key
app.get('/download-key', (req, res) => {
    const filePath = path.join(process.env.HOME, '.ssh', 'id_rsa');
    if (fs.existsSync(filePath)) {
        res.download(filePath, 'id_rsa.pem', (err) => { // Rename the download file
            if (err) {
                console.error('Error downloading file:', err);
                res.status(500).send('Error downloading file');
            }
        });
    } else {
        res.status(404).send('File not found');
    }
});

// Start the server
const port = process.env.PORT || 3000;
app.listen(port, () => {
    console.log(`Server running on port ${port}`);
});