# Step-by-Step Guide: Deploying TruthLens on AWS EC2

This guide is written specifically for beginners. We will go through setting up a server (an EC2 instance) on Amazon Web Services (AWS), installing the necessary tools, and launching your TruthLens application so it's live on the internet!

---

## Step 1: Prepare Your Code (Push to GitHub)
Before we create the server, the easiest way to get your code onto the server is through GitHub.
1. If you haven't already, create a free account on [GitHub](https://github.com/).
2. Upload your TruthLens code to a new **Private** repository. 
*(If you need help pushing your local code to GitHub, let me know!)*

---

## Step 2: Create Your AWS Server (EC2 Instance)
An EC2 instance is simply a computer running in an Amazon data center that you can control.

1. Go to [aws.amazon.com](https://aws.amazon.com/) and create an account (you will need a credit card, but we will use the Free Tier).
2. Log into the **AWS Management Console**.
3. In the search bar at the top, type **EC2** and click on it.
4. Click the orange **Launch instance** button.
5. **Name:** Type `TruthLens-Server`.
6. **OS Images (AMI):** Select **Ubuntu** (leave it on the default "Ubuntu Server 24.04 LTS" or "22.04 LTS" which is Free tier eligible).
7. **Instance Type:** Select `t2.micro` (this is Free tier eligible). *Note: If the application struggles with memory, you may later need to upgrade to a `t2.small` or `t2.medium`, which costs a few dollars a month.*
8. **Key Pair:** 
   - Click **Create new key pair**.
   - Name it `truthlens-key`.
   - Leave the defaults (RSA, .pem) and click **Create**. 
   - *A file will download to your computer. Keep it safe, you might need it later!*

### Step 3: Configure Network Settings (Opening Ports)
Your server is locked down by default. We need to open doors (ports) so people can view your website.
1. Scroll down to **Network settings**.
2. Check the boxes for:
   - **Allow SSH traffic from Anywhere** (Port 22)
   - **Allow HTTP traffic from the internet** (Port 80)
   - **Allow HTTPS traffic from the internet** (Port 443)
3. Click the **Edit** button in the Network settings box.
4. Scroll down and click **Add security group rule**.
   - **Type:** Custom TCP
   - **Port range:** `3000` (This is where your frontend runs)
   - **Source type:** Anywhere (`0.0.0.0/0`)
5. Click **Add security group rule** again.
   - **Type:** Custom TCP
   - **Port range:** `5000` (This is where your backend runs)
   - **Source type:** Anywhere (`0.0.0.0/0`)
6. Scroll to the bottom and click the orange **Launch instance** button.

---

## Step 4: Connect to Your Server
AWS makes it very easy to connect to your server directly through your web browser.

1. Click on the **Instances** link on the left sidebar to see your new server. Wait until the "Instance state" says **Running** (green).
2. Check the box next to your instance.
3. Click the **Connect** button at the top of the screen.
4. Stay on the **EC2 Instance Connect** tab and click the orange **Connect** button at the bottom.
5. A black terminal window will open in your browser. You are now inside your server!

---

## Step 5: Install Docker and Git
Now we need to install the software that will run your app. In the black terminal window, copy and paste these commands one by one (press Enter after each):

**1. Update the server:**
```bash
sudo apt update && sudo apt upgrade -y
```

**2. Install Docker:**
```bash
sudo apt install docker.io docker-compose-v2 git -y
```

**3. Give yourself permission to run Docker:**
```bash
sudo usermod -aG docker ubuntu
```
*(After running this command, type `exit` to close the terminal, then click "Connect" from the AWS console again to open a fresh terminal so the permissions take effect).*

---

## Step 6: Download Your Code and Setup
Once you're reconnected to the terminal:

**1. Clone your code from GitHub:**
```bash
git clone https://github.com/YOUR_USERNAME/YOUR_REPOSITORY_NAME.git
```
*(It will ask for your GitHub username and password. For the password, GitHub requires a "Personal Access Token" instead of your actual password. If you don't know how to generate one, let me know).*

**2. Go into your project folder:**
```bash
cd YOUR_REPOSITORY_NAME
```

**3. Set up your environment variables:**
You need to copy your `.env` file to the server. We can create it directly:
```bash
nano backend/.env
```
This opens a text editor inside the terminal. Paste your API keys and configuration here (make sure you add your Groq/OpenAI keys). 
When done, press `Ctrl+O` then `Enter` to save, and `Ctrl+X` to exit.

---

## Step 7: Launch the Application!
Now for the magic moment. Tell Docker to build and start everything:

```bash
docker compose up -d --build
```

This will take a few minutes as it downloads databases, Python, Node.js, and builds your application.

## Step 8: View Your Website
1. Go back to your AWS EC2 Console tab.
2. Select your instance and look for the **Public IPv4 address** (it looks like `54.123.45.67`).
3. Open a new tab in your browser and type: `http://YOUR_PUBLIC_IP:3000`
4. You should see your TruthLens app live!

> [!WARNING]  
> **Important Note on the Free Tier**: TruthLens is a fairly heavy application because it uses a PostgreSQL database, a Node.js server, and a Python AI server. The `t2.micro` (1GB RAM) included in the free tier *might* freeze or crash during the build process because it runs out of memory. If the `docker compose up` command fails or freezes, you will likely need to stop the instance, change the instance type to `t3.small` (2GB RAM), and start it again (which costs about $15/month). 

Let me know if you want to start this process! We can tackle Step 1 first.
