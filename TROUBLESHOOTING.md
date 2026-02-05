# Troubleshooting Guide for WSL/Linux

This document contains solutions to common issues when running SilverGait on WSL or Linux.

## Installation Issues

### Error: `python3-venv module not found`

**Symptoms:**
```
Error: python3-venv module not found
```

**Solution:**
```bash
# Ubuntu/Debian/WSL
sudo apt update
sudo apt install python3-venv

# Fedora/RHEL
sudo dnf install python3-devel

# Arch Linux
sudo pacman -S python
```

### Error: `Python 3.10+ required, found 3.8`

**Solution:** Install a newer Python version

**On Ubuntu/Debian:**
```bash
sudo apt install software-properties-common
sudo add-apt-repository ppa:deadsnakes/ppa
sudo apt update
sudo apt install python3.10 python3.10-venv python3.10-dev

# Use python3.10 explicitly
python3.10 -m venv backend/venv
```

**On Fedora/RHEL:**
```bash
sudo dnf install python3.10
```

### Error: `node not found` or old Node.js version

**Solution:** Install latest Node.js

**Ubuntu/Debian/WSL:**
```bash
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt install nodejs
```

**Fedora/RHEL:**
```bash
sudo dnf module enable nodejs:18
sudo dnf install nodejs
```

**Using nvm (any Linux):**
```bash
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash
source ~/.bashrc
nvm install 18
nvm use 18
```

## Runtime Issues

### Port Already in Use

**Symptoms:**
```
Error: Port 8000 (or 5173) is already in use
```

**Solution:**
```bash
# Find process using the port
sudo lsof -i :8000
sudo lsof -i :5173

# Kill the process (replace PID with the actual process ID)
kill PID
```

### Hot Reload Not Working in WSL

**Symptoms:** Code changes don't trigger automatic reload

**Solution 1:** Increase inotify watchers
```bash
echo fs.inotify.max_user_watches=524288 | sudo tee -a /etc/sysctl.conf
sudo sysctl -p
```

**Solution 2:** Enable polling in Vite

Edit `frontend/vite.config.ts` and uncomment:
```typescript
server: {
  watch: {
    usePolling: true,
  }
}
```

### Cannot Access from Windows Browser (WSL)

**Symptoms:** `localhost:5173` doesn't work from Windows

**Solution 1:** Use WSL IP address
```bash
# In WSL terminal
ip addr show eth0 | grep inet
# Use the IP shown (e.g., 172.x.x.x)
```

Access from Windows: `http://172.x.x.x:5173`

**Solution 2:** Check Windows Firewall
```powershell
# Run in PowerShell as Administrator
New-NetFirewallRule -DisplayName "WSL" -Direction Inbound -InterfaceAlias "vEthernet (WSL)" -Action Allow
```

### Permission Denied Running Scripts

**Symptoms:**
```
bash: ./run.sh: Permission denied
```

**Solution:**
```bash
chmod +x run.sh share.sh share-lt.sh
```

### Virtual Environment Activation Issues

**Symptoms:**
```
source: command not found
```

**Solution:** Use correct activation command for your shell

**Bash/Zsh:**
```bash
source backend/venv/bin/activate
```

**Fish:**
```bash
source backend/venv/bin/activate.fish
```

**Csh/Tcsh:**
```bash
source backend/venv/bin/activate.csh
```

## Performance Issues

### Slow npm install

**Solution 1:** Clear npm cache
```bash
npm cache clean --force
cd frontend
rm -rf node_modules package-lock.json
npm install
```

**Solution 2:** Use faster package manager
```bash
# Install pnpm
npm install -g pnpm

# Use pnpm instead
cd frontend
pnpm install
```

### Out of Memory in WSL

**Solution:** Increase WSL memory limit

Create/edit `%USERPROFILE%\.wslconfig` on Windows:
```ini
[wsl2]
memory=4GB
processors=4
swap=2GB
```

Restart WSL:
```powershell
wsl --shutdown
```

### Slow Python Package Installation

**Solution:** Use faster pip options
```bash
pip install -r backend/requirements.txt --use-pep517 --no-cache-dir
```

## Network Issues

### Cannot Connect to Backend from Frontend

**Symptoms:** Frontend shows connection errors to backend

**Solution 1:** Check backend is running
```bash
curl http://localhost:8000/api/docs
```

**Solution 2:** Check proxy configuration in `frontend/vite.config.ts`:
```typescript
proxy: {
  '/api': {
    target: 'http://localhost:8000',
    changeOrigin: true,
  },
}
```

### ngrok/localtunnel Not Working

**For ngrok:**
```bash
# Install ngrok
sudo snap install ngrok

# Configure authtoken
ngrok config add-authtoken YOUR_TOKEN

# Test
ngrok http 5173
```

**For localtunnel:**
```bash
# Install globally
npm install -g localtunnel

# Test
lt --port 5173
```

### Cannot Access from Mobile Device

**Solution:** 
1. Ensure firewall allows connections
2. Use `host: true` in vite.config.ts (already configured)
3. Find your local IP:
```bash
ip addr show | grep "inet " | grep -v 127.0.0.1
```
4. Access from mobile: `http://YOUR_IP:5173`

## Build Issues

### TypeScript Compilation Errors

**Solution:**
```bash
cd frontend
npm run build -- --mode development
# Review errors and fix
```

### Vite Build Fails

**Solution 1:** Clear cache
```bash
cd frontend
rm -rf node_modules/.vite
npm run build
```

**Solution 2:** Update dependencies
```bash
cd frontend
npm update
npm run build
```

## WSL-Specific Issues

### WSL1 vs WSL2

Most issues occur with WSL1. Upgrade to WSL2:
```powershell
# In PowerShell as Administrator
wsl --set-default-version 2
wsl --set-version Ubuntu 2
```

### File System Performance

**Issue:** Slow file operations

**Solution:** Keep project files in WSL file system, not Windows (e.g., `/mnt/c/`)

**Good:** `/home/username/projects/SilverGait`
**Bad:** `/mnt/c/Users/username/projects/SilverGait`

### Line Ending Issues

**Solution:** Configure git to handle line endings
```bash
git config --global core.autocrlf input
```

## Getting More Help

If your issue isn't listed here:

1. **Check Logs:**
   ```bash
   # Backend logs (if running)
   tail -f backend/logs/app.log
   
   # Check Python errors
   cd backend && source venv/bin/activate && python -m app.main
   
   # Check frontend errors
   cd frontend && npm run dev
   ```

2. **Verify Environment:**
   ```bash
   python3 --version
   node --version
   npm --version
   which python3 node npm
   ```

3. **Check System Resources:**
   ```bash
   free -h  # Memory
   df -h    # Disk space
   ```

4. **Open an Issue:**
   Visit: https://github.com/awpbash/SilverGait/issues
   
   Include:
   - OS/distribution and version
   - Python version
   - Node.js version
   - Full error message
   - Steps to reproduce

## Useful Commands

```bash
# Check if services are running
ps aux | grep -E "(uvicorn|vite)"

# Check ports
netstat -tlnp | grep -E ":8000|:5173"

# Test backend API
curl http://localhost:8000/api/docs

# Clean everything and start fresh
cd backend && rm -rf venv .env
cd ../frontend && rm -rf node_modules
cd .. && ./run.sh
```

## References

- [WSL Documentation](https://docs.microsoft.com/en-us/windows/wsl/)
- [Vite Configuration](https://vitejs.dev/config/)
- [FastAPI Documentation](https://fastapi.tiangolo.com/)
- [Main Installation Guide](INSTALL_LINUX.md)
