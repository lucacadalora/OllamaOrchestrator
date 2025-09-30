#!/usr/bin/env python3
"""
DGON Node Agent - MacBook with Ollama
Connects your MacBook running Ollama to the DGON network as a compute node.
"""

import os
import time
import hmac
import hashlib
import json
import sys
from urllib.request import Request, urlopen
from urllib.error import HTTPError, URLError

# Configuration from environment variables
API_BASE = os.getenv("DGON_API", "http://localhost:5000/api")
NODE_ID = os.getenv("NODE_ID", f"macbook-{os.urandom(4).hex()}")
REGION = os.getenv("REGION", "ap-southeast")
RUNTIME = "ollama"
NODE_TOKEN = os.getenv("NODE_TOKEN")

# ANSI color codes for terminal output
GREEN = "\033[92m"
YELLOW = "\033[93m"
RED = "\033[91m"
BLUE = "\033[94m"
RESET = "\033[0m"

def log(message, color=""):
    """Print colored log message with timestamp"""
    timestamp = time.strftime("%H:%M:%S")
    print(f"{color}[{timestamp}] {message}{RESET}")

def calculate_hmac(secret, body, timestamp):
    """Calculate HMAC-SHA256 signature for request authentication"""
    message = body + timestamp.encode('utf-8')
    return hmac.new(secret.encode(), message, hashlib.sha256).hexdigest()

def check_ollama_ready():
    """Check if Ollama is running and has models loaded"""
    try:
        req = Request("http://127.0.0.1:11434/api/tags", method='GET')
        with urlopen(req, timeout=2) as response:
            data = json.loads(response.read().decode())
            models = data.get("models", [])
            model_names = [m.get("name", "").split(":")[0] for m in models] if models else []
            return len(models) > 0, len(models), model_names
    except Exception:
        return False, 0, []

def register_node():
    """Register this node with the DGON network"""
    log(f"Registering node: {NODE_ID}", BLUE)
    
    data = {
        "id": NODE_ID,
        "region": REGION,
        "runtime": RUNTIME,
        "asnHint": "residential",
        "walletAddress": "",
        "greenEnergy": False
    }
    
    body = json.dumps(data).encode('utf-8')
    req = Request(
        f"{API_BASE}/v1/nodes/register",
        data=body,
        headers={'Content-Type': 'application/json'},
        method='POST'
    )
    
    try:
        with urlopen(req, timeout=10) as response:
            result = json.loads(response.read().decode())
            token = result.get("nodeToken")
            log(f"✓ Registered successfully! Node ID: {NODE_ID}", GREEN)
            log(f"  Node token: {token[:16]}...", GREEN)
            return token
    except HTTPError as e:
        error_msg = e.read().decode()
        log(f"✗ Registration failed: {error_msg}", RED)
        sys.exit(1)
    except URLError as e:
        log(f"✗ Cannot connect to API: {e.reason}", RED)
        log(f"  Make sure the DGON Console is running at: {API_BASE}", YELLOW)
        sys.exit(1)

def send_heartbeat(token, ready, model_count=0, model_names=None):
    """Send heartbeat to DGON network with node status"""
    data = {
        "gpuUtil": 0.4,
        "memUsedGb": 6.0,
        "p95Ms": 320,
        "ready": ready,
        "models": model_names or []
    }
    
    body = json.dumps(data).encode('utf-8')
    timestamp = str(int(time.time()))
    signature = calculate_hmac(token, body, timestamp)
    
    req = Request(
        f"{API_BASE}/v1/nodes/heartbeat",
        data=body,
        headers={
            'Content-Type': 'application/json',
            'X-Node-Id': NODE_ID,
            'X-Node-Ts': timestamp,
            'X-Node-Auth': signature
        },
        method='POST'
    )
    
    try:
        with urlopen(req, timeout=10) as response:
            result = json.loads(response.read().decode())
            status = result.get("status")
            
            if status == "active":
                log(f"✓ Heartbeat sent - Status: ACTIVE ({model_count} models loaded)", GREEN)
            else:
                log(f"○ Heartbeat sent - Status: PENDING (waiting for Ollama)", YELLOW)
            
            return True
    except HTTPError as e:
        error_msg = e.read().decode()
        log(f"✗ Heartbeat failed: {error_msg}", RED)
        return False
    except URLError as e:
        log(f"✗ Connection error: {e.reason}", RED)
        return False

def poll_for_inference_requests(token):
    """Poll for inference requests from the queue"""
    timestamp = str(int(time.time()))
    signature = calculate_hmac(token, b"", timestamp)
    
    req = Request(
        f"{API_BASE}/v1/inference/poll",
        headers={
            'X-Node-Id': NODE_ID,
            'X-Node-Ts': timestamp,
            'X-Node-Auth': signature
        },
        method='GET'
    )
    
    try:
        with urlopen(req, timeout=10) as response:
            result = json.loads(response.read().decode())
            if result and result.get('id'):
                # We have a request to process
                request_id = result.get('id')
                model = result.get('model', 'llama3.2')
                messages = result.get('messages', [])
                
                log(f"📥 Processing inference request {request_id[:8]}...", BLUE)
                
                # Convert messages to Ollama format
                prompt = ""
                for msg in messages:
                    role = msg.get('role', 'user')
                    content = msg.get('content', '')
                    if role == 'system':
                        prompt = f"System: {content}\n\n{prompt}"
                    elif role == 'user':
                        prompt += f"User: {content}\n\n"
                    elif role == 'assistant':
                        prompt += f"Assistant: {content}\n\n"
                
                prompt += "Assistant: "
                
                # Call Ollama API
                ollama_data = {
                    "model": model,
                    "prompt": prompt,
                    "stream": False
                }
                
                ollama_req = Request(
                    "http://127.0.0.1:11434/api/generate",
                    data=json.dumps(ollama_data).encode('utf-8'),
                    headers={'Content-Type': 'application/json'},
                    method='POST'
                )
                
                try:
                    with urlopen(ollama_req, timeout=60) as ollama_response:
                        ollama_result = json.loads(ollama_response.read().decode())
                        ai_response = ollama_result.get("response", "")
                        
                        # Send response back to console
                        submit_inference_response(token, request_id, ai_response)
                        log(f"✓ Inference completed for model {model}", GREEN)
                        
                except Exception as e:
                    # Send error back to console
                    submit_inference_response(token, request_id, None, str(e))
                    log(f"✗ Ollama error: {e}", RED)
                    
    except HTTPError as e:
        if e.code != 404:  # 404 means no pending requests
            log(f"✗ Poll error: {e.read().decode()}", RED)
    except Exception as e:
        log(f"✗ Poll error: {e}", RED)

def submit_inference_response(token, request_id, response, error=None):
    """Submit inference response back to console"""
    data = {
        "id": request_id,
        "status": "completed" if response else "failed",
        "response": response,
        "error": error
    }
    
    body = json.dumps(data).encode('utf-8')
    timestamp = str(int(time.time()))
    signature = calculate_hmac(token, body, timestamp)
    
    req = Request(
        f"{API_BASE}/v1/inference/complete",
        data=body,
        headers={
            'Content-Type': 'application/json',
            'X-Node-Id': NODE_ID,
            'X-Node-Ts': timestamp,
            'X-Node-Auth': signature
        },
        method='POST'
    )
    
    try:
        with urlopen(req, timeout=10) as response:
            log(f"✓ Response submitted", GREEN)
    except Exception as e:
        log(f"✗ Failed to submit response: {e}", RED)

def send_test_receipt(token):
    """Send a test receipt (optional - for testing)"""
    receipt_id = f"r_test_{int(time.time())}"
    
    data = {
        "id": receipt_id,
        "nodeId": NODE_ID,
        "region": REGION,
        "modelId": "llama3.1-8b",
        "payload": {
            "version": "1.0",
            "ts_start": int(time.time()) - 16,
            "ts_end": int(time.time()),
            "model_hash": "sha256:test",
            "prompt_hash": "blake3:test",
            "tokens_input": 128,
            "tokens_output": 92,
            "p95_ms": 310,
            "s3_checkpoints": [100],
            "hedged": False,
            "cache_hit": True,
            "signature": "ed25519:test"
        }
    }
    
    body = json.dumps(data).encode('utf-8')
    timestamp = str(int(time.time()))
    signature = calculate_hmac(token, body, timestamp)
    
    req = Request(
        f"{API_BASE}/v1/receipts",
        data=body,
        headers={
            'Content-Type': 'application/json',
            'X-Node-Id': NODE_ID,
            'X-Node-Ts': timestamp,
            'X-Node-Auth': signature
        },
        method='POST'
    )
    
    try:
        with urlopen(req, timeout=10) as response:
            result = json.loads(response.read().decode())
            log(f"✓ Test receipt sent: {receipt_id}", GREEN)
    except Exception as e:
        log(f"✗ Receipt failed: {e}", RED)

def main():
    """Main agent loop"""
    print(f"""
{BLUE}╔══════════════════════════════════════════════════╗
║     DGON Node Agent - MacBook with Ollama        ║
╚══════════════════════════════════════════════════╝{RESET}

Configuration:
  API Base:  {API_BASE}
  Node ID:   {NODE_ID}
  Region:    {REGION}
  Runtime:   {RUNTIME}

""")
    
    # Register or use existing token
    if NODE_TOKEN:
        log(f"Using existing node token from environment", BLUE)
        token = NODE_TOKEN
    else:
        token = register_node()
        log(f"", "")
        log(f"💡 Save this token for future runs:", YELLOW)
        log(f"   export NODE_TOKEN={token}", YELLOW)
        log(f"", "")
    
    # Check Ollama status
    ready, model_count, model_names = check_ollama_ready()
    if ready:
        log(f"✓ Ollama is running with {model_count} model(s) loaded", GREEN)
        log(f"  Available models: {', '.join(model_names)}", GREEN)
    else:
        log(f"⚠ Ollama is not ready (no models loaded or not running)", YELLOW)
        log(f"  Start Ollama and load a model to activate this node", YELLOW)
    
    # Send initial heartbeat  
    send_heartbeat(token, ready, model_count, model_names)
    
    # Optional: Send test receipt on first run
    if ready and not NODE_TOKEN:
        time.sleep(2)
        log(f"Sending test receipt...", BLUE)
        send_test_receipt(token)
    
    log(f"", "")
    log(f"🔄 Starting agent loop...", BLUE)
    log(f"   Heartbeat: every 10 seconds", BLUE)
    log(f"   Inference polling: every 2 seconds", BLUE)
    log(f"   Press Ctrl+C to stop", BLUE)
    log(f"", "")
    
    # Main loop with both heartbeat and inference polling
    last_heartbeat = time.time()
    
    try:
        while True:
            # Send heartbeat every 10 seconds
            if time.time() - last_heartbeat >= 10:
                ready, model_count, model_names = check_ollama_ready()
                send_heartbeat(token, ready, model_count, model_names)
                last_heartbeat = time.time()
            
            # Poll for inference requests if node is ready
            ready, model_count, model_names = check_ollama_ready()
            if ready:
                poll_for_inference_requests(token)
            
            # Short sleep to prevent busy waiting
            time.sleep(2)
    except KeyboardInterrupt:
        log(f"", "")
        log(f"👋 Agent stopped by user", YELLOW)
        sys.exit(0)

if __name__ == "__main__":
    main()
