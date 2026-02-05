# WSL/Linux Installation Guide

This guide helps you set up SilverGait on Windows Subsystem for Linux (WSL) or native Linux systems.

## Prerequisites

### For WSL Users

1. **Enable WSL** (Windows 10/11):
   ```powershell
   # Run in PowerShell as Administrator
   wsl --install
   ```

2. **Install Ubuntu** (recommended):
   ```powershell
   wsl --install -d Ubuntu
   ```

3. **Update WSL** (if already installed):
   ```bash
   wsl --update
   ```

### System Requirements

- Python 3.10 or higher
- Node.js 18 or higher
- Git
- At least 2GB free disk space

## Installation Steps

### 1. Install System Dependencies

#### On Ubuntu/Debian (including WSL Ubuntu):

```bash
# Update package lists
sudo apt update

# Install Python and essential tools
sudo apt install -y python3 python3-pip python3-venv

# Install Node.js (using NodeSource repository for latest version)
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt install -y nodejs

# Install Git (if not already installed)
sudo apt install -y git

# Optional: Install build essentials (may be needed for some Python packages)
sudo apt install -y build-essential
```

#### On Fedora/RHEL/CentOS:

```bash
# Update package lists
sudo dnf update -y

# Install Python and essential tools
sudo dnf install -y python3 python3-pip python3-devel

# Install Node.js
sudo dnf install -y nodejs npm

# Install Git
sudo dnf install -y git

# Optional: Install development tools
sudo dnf groupinstall -y "Development Tools"
```

#### On Arch Linux:

```bash
# Update package database
sudo pacman -Syu

# Install Python and Node.js
sudo pacman -S python python-pip nodejs npm git
```

### 2. Clone the Repository

```bash
git clone https://github.com/awpbash/SilverGait.git
cd SilverGait
```

### 3. Set Up Environment Variables

```bash
# Copy the example environment file
cp .env.example .env

# Edit with your favorite editor (nano, vim, or code)
nano .env
```

Add your Gemini API key:
```
GEMINI_API_KEY=your_actual_api_key_here
```

Get your API key from: https://aistudio.google.com/app/apikey

### 4. Run the Application

```bash
# Make scripts executable (if needed)
chmod +x run.sh share.sh share-lt.sh

# Start the application
./run.sh
```

The first run will:
- Create a Python virtual environment
- Install all Python dependencies
- Install all Node.js dependencies
- Start both backend and frontend servers

### 5. Access the Application

- **Frontend**: http://localhost:5173
- **Backend API**: http://localhost:8000
- **API Documentation**: http://localhost:8000/api/docs

## Common Issues and Solutions

### Issue: `python3-venv` not found

**Solution**:
```bash
sudo apt install python3-venv
```

### Issue: Python version too old

**Solution**: Install a newer Python version
```bash
# Ubuntu/Debian - Add deadsnakes PPA for newer Python versions
sudo apt install software-properties-common
sudo add-apt-repository ppa:deadsnakes/ppa
sudo apt update
sudo apt install python3.10 python3.10-venv python3.10-dev
```

### Issue: Node.js version too old

**Solution**: Use NodeSource repository
```bash
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt install nodejs
```

### Issue: Permission denied when running scripts

**Solution**: Make scripts executable
```bash
chmod +x run.sh share.sh share-lt.sh
```

### Issue: Port 5173 or 8000 already in use

**Solution**: Kill the process using the port
```bash
# Find process using port
sudo lsof -i :5173
sudo lsof -i :8000

# Kill the process (replace PID with actual process ID)
kill -9 PID
```

Or modify the ports in:
- `run.sh` (line 102 for backend, frontend uses vite.config.ts)
- `frontend/vite.config.ts` (for frontend port)

### Issue: WSL can't connect to localhost

**Solution**: Use the WSL IP address instead
```bash
# Get WSL IP address
ip addr show eth0 | grep inet

# Access via: http://<WSL-IP>:5173
```

### Issue: Out of memory during npm install

**Solution**: Increase WSL memory limit
1. Create/edit `%USERPROFILE%\.wslconfig` on Windows:
```ini
[wsl2]
memory=4GB
```
2. Restart WSL: `wsl --shutdown` in PowerShell

## Sharing Your Instance

### Option 1: Using ngrok (Recommended)

1. **Install ngrok**:
   ```bash
   # Using snap
   sudo snap install ngrok
   
   # Or download from https://ngrok.com/download
   ```

2. **Configure with your authtoken**:
   ```bash
   ngrok config add-authtoken YOUR_TOKEN
   # Get token from: https://dashboard.ngrok.com/get-started/your-authtoken
   ```

3. **Share**:
   ```bash
   ./share.sh
   ```

### Option 2: Using localtunnel (No signup required)

```bash
./share-lt.sh
```

Note: First access may show a warning page - just click "Continue"

## Development Tips

### Hot Reload Not Working in WSL

If file watching doesn't work in WSL:

1. **Use polling** - Edit `frontend/vite.config.ts`:
   ```typescript
   export default defineConfig({
     server: {
       watch: {
         usePolling: true
       }
     }
   })
   ```

2. **Increase inotify watchers**:
   ```bash
   echo fs.inotify.max_user_watches=524288 | sudo tee -a /etc/sysctl.conf
   sudo sysctl -p
   ```

### Running in Background

Use `screen` or `tmux`:

```bash
# Install screen
sudo apt install screen

# Start a new screen session
screen -S silvergait

# Run the app
./run.sh

# Detach: Press Ctrl+A, then D
# Reattach: screen -r silvergait
```

### Accessing from Windows Host

When running in WSL, access via `localhost` from Windows browsers should work automatically. If not, use the WSL IP:

```bash
# In WSL, get the IP
hostname -I
```

Then access from Windows: `http://<WSL-IP>:5173`

## Testing Mobile Devices

To test on mobile devices on the same network:

1. **Find your local IP**:
   ```bash
   # On Linux/WSL
   ip addr show | grep "inet " | grep -v 127.0.0.1
   ```

2. **Update Vite config** to allow external access (already configured in `vite.config.ts`)

3. **Access from mobile**: `http://<YOUR-IP>:5173`

4. **Or use ngrok/localtunnel** for external access:
   ```bash
   ./share.sh  # or ./share-lt.sh
   ```

## Stopping the Application

Press `Ctrl+C` in the terminal where you ran `./run.sh`

Or kill the processes manually:
```bash
# Find and kill processes
pkill -f "uvicorn"
pkill -f "vite"
```

## Uninstallation

```bash
# Remove virtual environment and dependencies
rm -rf backend/venv
rm -rf frontend/node_modules

# Remove the project (if desired)
cd ..
rm -rf SilverGait
```

## Getting Help

If you encounter issues not covered here:

1. Check the main [README.md](README.md)
2. Review error messages in the terminal
3. Open an issue on GitHub with:
   - Your OS/distribution and version
   - Python version (`python3 --version`)
   - Node.js version (`node --version`)
   - Full error message
   - Steps to reproduce

## Additional Resources

- [WSL Documentation](https://docs.microsoft.com/en-us/windows/wsl/)
- [Python Virtual Environments](https://docs.python.org/3/tutorial/venv.html)
- [Node.js on Linux](https://nodejs.org/en/download/package-manager/)
- [Gemini API Documentation](https://ai.google.dev/docs)
