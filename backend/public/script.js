let statusCheckInterval;

document.getElementById('installVSCode').addEventListener('change', function () {
    const vscodeUrlContainer = document.getElementById('vscodeUrlContainer');
    vscodeUrlContainer.style.display = this.checked ? 'block' : 'none';
});

async function deployInstance() {
    const awsAccessKey = document.getElementById('awsAccessKey').value;
    const awsSecretKey = document.getElementById('awsSecretKey').value;
    const region = document.getElementById('region').value;
    const amiId = document.getElementById('amiId').value;
    const installDocker = document.getElementById('installDocker').checked;
    const installNode = document.getElementById('installNode').checked;
    const installVSCode = document.getElementById('installVSCode').checked;
    const installNginx = document.getElementById('installNginx').checked;

    try {
        // Show loading spinner
        document.getElementById('loading').style.display = 'block';

        const response = await fetch('/deploy', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                awsAccessKey,
                awsSecretKey,
                region,
                amiId,
                installDocker,
                installNode,
                installVSCode,
                installNginx
            })
        });

        if (!response.ok) {
            throw new Error('Network response was not ok');
        }

        const result = await response.json();
        alert(result.message);

        // Start checking status
        statusCheckInterval = setInterval(checkDeploymentStatus, 5000);  // Check every 5 seconds

    } catch (error) {
        console.error('Error:', error);
        alert('Error starting deployment. Please check the console for details.');
    }
}

async function checkDeploymentStatus() {
    try {
        const response = await fetch('/status');
        const status = await response.json();

        document.getElementById('deploymentStatus').textContent = status.status;

        if (status.status === 'completed') {
            clearInterval(statusCheckInterval);
            updateUIWithDeploymentInfo(status);

            // Hide loading spinner
            document.getElementById('loading').style.display = 'none';
        } else if (status.status === 'error') {
            clearInterval(statusCheckInterval);
            alert(`Deployment error: ${status.error}`);

            // Hide loading spinner
            document.getElementById('loading').style.display = 'none';
        }
    } catch (error) {
        console.error('Error checking status:', error);
    }
}

function updateUIWithDeploymentInfo(status) {
        if (document.getElementById('installVSCode').checked) {
            // Show the VS Code URL block if installVSCode is checked
            const vscodeUrlElement = document.getElementById('vscodeUrl');
            const vscodeUrl = status.vscodeServerUrl || `http://${status.publicIp}:8080`;
            vscodeUrlElement.textContent = vscodeUrl;
            vscodeUrlElement.href = vscodeUrl;
    
            document.getElementById('vscodeUrlContainer').style.display = 'block';
          } else {
            // Hide the VS Code URL block if installVSCode is not checked
            document.getElementById('vscodeUrlContainer').style.display = 'none';
        }

        // Hide loading spinner
        document.getElementById('loading').style.display = 'none';

        // Display the download link for the SSH key
        const downloadKeyElement = document.getElementById('downloadKey');
        downloadKeyElement.href = '/download-key';
        document.getElementById('downloadKeyContainer').style.display = 'block';

        // Display the SSH command
        const sshCommandElement = document.getElementById('sshCommand');
        sshCommandElement.textContent = `ssh -i "id_rsa.pem" ubuntu@${status.publicIp}`;
        document.getElementById('sshCommandContainer').style.display = 'block';
}
