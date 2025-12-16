#!/usr/bin/env python3
"""
DGON Node Agent
Connects your machine running Ollama to the DGON network as a compute node.
Works on macOS, Linux, and Windows.
"""

import os
import time
import hmac
import hashlib
import json
import sys
import threading
import platform
import subprocess
from urllib.request import Request, urlopen
from urllib.error import HTTPError, URLError

try:
    import websocket
    HAS_WEBSOCKET = True
except ImportError:
    HAS_WEBSOCKET = False

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
    print(f"{color}[{timestamp}] {message}{RESET}", flush=True)

# Cached hardware info (collected once on startup)
_hardware_info = None

def get_hardware_info():
    """Detect hardware information (CPU, GPU, memory, OS)"""
    global _hardware_info
    if _hardware_info is not None:
        return _hardware_info
    
    info = {
        "osName": platform.system(),
        "osVersion": platform.release(),
        "architecture": platform.machine(),
    }
    
    # Detect CPU
    try:
        if platform.system() == "Darwin":  # macOS
            result = subprocess.run(
                ["sysctl", "-n", "machdep.cpu.brand_string"],
                capture_output=True, text=True, timeout=5
            )
            if result.returncode == 0 and result.stdout.strip():
                info["cpuModel"] = result.stdout.strip()
            else:
                # For Apple Silicon, get chip name
                result = subprocess.run(
                    ["system_profiler", "SPHardwareDataType"],
                    capture_output=True, text=True, timeout=10
                )
                for line in result.stdout.split('\n'):
                    if 'Chip:' in line or 'Processor Name:' in line:
                        info["cpuModel"] = line.split(':')[1].strip()
                        break
        elif platform.system() == "Linux":
            with open("/proc/cpuinfo", "r") as f:
                for line in f:
                    if line.startswith("model name"):
                        info["cpuModel"] = line.split(":")[1].strip()
                        break
        elif platform.system() == "Windows":
            result = subprocess.run(
                ["wmic", "cpu", "get", "name"],
                capture_output=True, text=True, timeout=5
            )
            lines = result.stdout.strip().split('\n')
            if len(lines) > 1:
                info["cpuModel"] = lines[1].strip()
    except Exception:
        pass
    
    # Detect GPU
    try:
        if platform.system() == "Darwin":  # macOS
            result = subprocess.run(
                ["system_profiler", "SPDisplaysDataType"],
                capture_output=True, text=True, timeout=10
            )
            for line in result.stdout.split('\n'):
                if 'Chipset Model:' in line:
                    info["gpuModel"] = line.split(':')[1].strip()
                    break
            # For Apple Silicon, GPU is integrated
            if "gpuModel" not in info and "Apple" in info.get("cpuModel", ""):
                info["gpuModel"] = info.get("cpuModel", "Apple GPU")
        elif platform.system() == "Linux":
            # Try nvidia-smi first
            result = subprocess.run(
                ["nvidia-smi", "--query-gpu=name", "--format=csv,noheader"],
                capture_output=True, text=True, timeout=5
            )
            if result.returncode == 0 and result.stdout.strip():
                info["gpuModel"] = result.stdout.strip().split('\n')[0]
            else:
                # Fallback to lspci
                result = subprocess.run(
                    ["lspci"],
                    capture_output=True, text=True, timeout=5
                )
                for line in result.stdout.split('\n'):
                    if 'VGA' in line or '3D' in line:
                        info["gpuModel"] = line.split(':')[-1].strip()
                        break
        elif platform.system() == "Windows":
            result = subprocess.run(
                ["wmic", "path", "win32_VideoController", "get", "name"],
                capture_output=True, text=True, timeout=5
            )
            lines = result.stdout.strip().split('\n')
            if len(lines) > 1:
                info["gpuModel"] = lines[1].strip()
    except Exception:
        pass
    
    # Detect total memory
    try:
        if platform.system() == "Darwin":
            result = subprocess.run(
                ["sysctl", "-n", "hw.memsize"],
                capture_output=True, text=True, timeout=5
            )
            if result.returncode == 0:
                mem_bytes = int(result.stdout.strip())
                info["memoryGb"] = round(mem_bytes / (1024**3), 1)
        elif platform.system() == "Linux":
            with open("/proc/meminfo", "r") as f:
                for line in f:
                    if line.startswith("MemTotal"):
                        mem_kb = int(line.split()[1])
                        info["memoryGb"] = round(mem_kb / (1024**2), 1)
                        break
        elif platform.system() == "Windows":
            result = subprocess.run(
                ["wmic", "computersystem", "get", "totalphysicalmemory"],
                capture_output=True, text=True, timeout=5
            )
            lines = result.stdout.strip().split('\n')
            if len(lines) > 1:
                mem_bytes = int(lines[1].strip())
                info["memoryGb"] = round(mem_bytes / (1024**3), 1)
    except Exception:
        pass
    
    # Determine device type
    cpu = info.get("cpuModel", "").lower()
    if "apple m" in cpu:
        info["deviceType"] = "MacBook " + info.get("cpuModel", "Apple Silicon").replace("Apple ", "")
    elif "nvidia" in info.get("gpuModel", "").lower():
        gpu = info.get("gpuModel", "")
        if "rtx" in gpu.lower() or "gtx" in gpu.lower() or "a100" in gpu.lower():
            info["deviceType"] = gpu
        else:
            info["deviceType"] = "NVIDIA GPU Server"
    elif "amd" in info.get("gpuModel", "").lower():
        info["deviceType"] = info.get("gpuModel", "AMD GPU")
    elif platform.system() == "Darwin":
        info["deviceType"] = "Mac"
    else:
        info["deviceType"] = f"{platform.system()} Server"
    
    _hardware_info = info
    log(f"  Hardware detected: {info.get('deviceType', 'Unknown')}", BLUE)
    if info.get("cpuModel"):
        log(f"  CPU: {info['cpuModel']}", BLUE)
    if info.get("gpuModel"):
        log(f"  GPU: {info['gpuModel']}", BLUE)
    if info.get("memoryGb"):
        log(f"  Memory: {info['memoryGb']} GB", BLUE)
    
    return info

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
            # Keep full model names exactly as Ollama reports them (e.g. "llama3.2:latest", "gemma2:2b")
            model_names = [m.get("name", "") for m in models] if models else []
            return len(models) > 0, len(models), model_names
    except Exception:
        return False, 0, []

def register_node():
    """Register this node with the DGON network"""
    log(f"Registering node: {NODE_ID}", BLUE)
    log(f"Connecting to: {API_BASE}/v1/nodes/self-register", BLUE)
    
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
        f"{API_BASE}/v1/nodes/self-register",
        data=body,
        headers={'Content-Type': 'application/json'},
        method='POST'
    )
    
    try:
        log(f"Sending registration request...", BLUE)
        with urlopen(req, timeout=10) as response:
            result = json.loads(response.read().decode())
            token = result.get("token") or result.get("nodeToken")
            if token:
                log(f"✓ Registered successfully! Node ID: {NODE_ID}", GREEN)
                log(f"  Node token: {token[:16]}...", GREEN)
                return token
            else:
                log(f"✗ Registration failed: No token received", RED)
                return None
    except HTTPError as e:
        error_msg = e.read().decode()
        log(f"✗ Registration failed: {error_msg}", RED)
        sys.exit(1)
    except URLError as e:
        log(f"✗ Cannot connect to API: {str(e.reason)}", RED)
        log(f"  Make sure the DGON Console is running at: {API_BASE}", YELLOW)
        log(f"  Check your network connection and firewall settings", YELLOW)
        sys.exit(1)
    except Exception as e:
        log(f"✗ Unexpected error during registration: {str(e)}", RED)
        log(f"  Error type: {type(e).__name__}", YELLOW)
        sys.exit(1)

def send_heartbeat(token, ready, model_count=0, model_names=None):
    """Send heartbeat to DGON network with node status and hardware info"""
    # Get hardware info (cached after first call)
    hardware = get_hardware_info()
    
    # Get location from environment (user can set LOCATION env var like "Jakarta, Indonesia")
    location_str = os.getenv("LOCATION", "")
    location = None
    if location_str and "," in location_str:
        parts = location_str.split(",", 1)
        location = {
            "city": parts[0].strip(),
            "country": parts[1].strip()
        }
    
    data = {
        "gpuUtil": 0.4,
        "memUsedGb": 6.0,
        "p95Ms": 320,
        "ready": ready,
        "models": model_names or [],
        "hardware": hardware,
    }
    
    if location:
        data["location"] = location
    
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
                
                # Call Ollama API with streaming enabled
                ollama_data = {
                    "model": model,
                    "prompt": prompt,
                    "stream": True
                }
                
                ollama_req = Request(
                    "http://127.0.0.1:11434/api/generate",
                    data=json.dumps(ollama_data).encode('utf-8'),
                    headers={'Content-Type': 'application/json'},
                    method='POST'
                )
                
                try:
                    full_response = ""
                    full_reasoning = ""
                    response_buffer = []
                    reasoning_buffer = []
                    
                    # FIX #2: Optimized batching thresholds per senior engineer
                    # Flush when: ≥5 tokens OR ≥40 chars OR ≥75ms elapsed OR done
                    buffer_size = 5  # Tokens per batch
                    min_chars = 40   # Characters per batch  
                    flush_interval = 0.075  # 75ms max delay
                    last_flush_time = time.time()
                    
                    with urlopen(ollama_req, timeout=300) as ollama_response:
                        # Stream tokens from Ollama
                        for line in ollama_response:
                            if line:
                                chunk = json.loads(line.decode())
                                
                                # Handle reasoning models (dual stream)
                                reasoning_chunk = chunk.get("reasoning", "")
                                response_chunk = chunk.get("response", "")
                                is_done = chunk.get("done", False)
                                
                                if reasoning_chunk:
                                    full_reasoning += reasoning_chunk
                                    reasoning_buffer.append(reasoning_chunk)
                                
                                if response_chunk:
                                    full_response += response_chunk
                                    response_buffer.append(response_chunk)
                                
                                # Calculate total buffered characters
                                buffered_chars = sum(len(s) for s in response_buffer) + sum(len(s) for s in reasoning_buffer)
                                token_count = len(response_buffer) + len(reasoning_buffer)
                                
                                # FIX #2: Optimized flush conditions
                                current_time = time.time()
                                time_elapsed = current_time - last_flush_time
                                
                                should_flush = (
                                    token_count >= buffer_size or          # 5+ tokens
                                    buffered_chars >= min_chars or         # 40+ characters
                                    time_elapsed >= flush_interval or      # 75ms elapsed
                                    is_done                                # Stream complete
                                )
                                
                                if should_flush and (response_buffer or reasoning_buffer):
                                    # Send reasoning chunk if we have one
                                    if reasoning_buffer:
                                        combined_reasoning = "".join(reasoning_buffer)
                                        submit_inference_chunk(token, request_id, combined_reasoning, is_done, content_type="reasoning")
                                        reasoning_buffer = []
                                    
                                    # Send response chunk if we have one
                                    if response_buffer:
                                        combined_response = "".join(response_buffer)
                                        submit_inference_chunk(token, request_id, combined_response, is_done, content_type="response")
                                        response_buffer = []
                                    
                                    last_flush_time = current_time
                        
                        # Send final complete response
                        submit_inference_response(token, request_id, full_response, reasoning=full_reasoning)
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


# Global state for offset tracking
request_offsets = {}
request_sequences = {}

def submit_inference_chunk(token, request_id, chunk, done=False, content_type="response"):
    """Submit a streaming chunk back to console with offset tracking"""
    global request_offsets, request_sequences
    
    # Initialize if new request
    if request_id not in request_offsets:
        request_offsets[request_id] = 0
        request_sequences[request_id] = 0
    
    offset = request_offsets[request_id]
    seq = request_sequences[request_id]
    
    # Prepare delta-based payload
    data = {
        "id": request_id,
        "seq": seq,
        "offset": offset,
        "delta": chunk,  # This is already a delta from Ollama
        "done": done,
        "contentType": content_type  # "reasoning" or "response"
    }
    
    body = json.dumps(data).encode('utf-8')
    timestamp = str(int(time.time()))
    signature = calculate_hmac(token, body, timestamp)
    
    req = Request(
        f"{API_BASE}/v1/inference/stream",
        data=body,
        headers={
            'Content-Type': 'application/json',
            'X-Node-Id': NODE_ID,
            'X-Node-Ts': timestamp,
            'X-Node-Auth': signature
        },
        method='POST'
    )
    
    max_retries = 3
    retry_count = 0
    
    while retry_count < max_retries:
        try:
            with urlopen(req, timeout=10) as response:
                result = json.loads(response.read().decode())
                
                # Update offset on success
                if result.get('ok'):
                    request_offsets[request_id] = result.get('offset', offset + len(chunk))
                    request_sequences[request_id] = seq + 1
                    
                    # Clean up state when done
                    if done:
                        del request_offsets[request_id]
                        del request_sequences[request_id]
                    return
                    
        except HTTPError as e:
            if e.code == 409:
                # Offset mismatch, re-sync with server's expected offset
                error_data = json.loads(e.read().decode())
                expected_offset = error_data.get('expected', 0)
                
                log(f"⚠ Offset mismatch - expected: {expected_offset}, had: {offset}. Retrying...", YELLOW)
                
                # Update our offset to match server
                request_offsets[request_id] = expected_offset
                
                # Retry with the same delta but corrected offset
                # The delta is still valid, we just need to send it with the right offset
                retry_data = {
                    "id": request_id,
                    "seq": seq,
                    "offset": expected_offset,
                    "delta": chunk,
                    "done": done,
                    "contentType": content_type
                }
                
                retry_body = json.dumps(retry_data).encode('utf-8')
                retry_timestamp = str(int(time.time()))
                retry_signature = calculate_hmac(token, retry_body, retry_timestamp)
                
                retry_req = Request(
                    f"{API_BASE}/v1/inference/stream",
                    data=retry_body,
                    headers={
                        'Content-Type': 'application/json',
                        'X-Node-Id': NODE_ID,
                        'X-Node-Ts': retry_timestamp,
                        'X-Node-Auth': retry_signature
                    },
                    method='POST'
                )
                
                # Retry with corrected offset
                with urlopen(retry_req, timeout=10) as retry_response:
                    retry_result = json.loads(retry_response.read().decode())
                    if retry_result.get('ok'):
                        request_offsets[request_id] = retry_result.get('offset', expected_offset + len(chunk))
                        request_sequences[request_id] = seq + 1
                        if done:
                            del request_offsets[request_id]
                            del request_sequences[request_id]
                return  # Successfully retried
            else:
                retry_count += 1
                if retry_count >= max_retries:
                    log(f"✗ Failed to submit chunk after {max_retries} retries", RED)
                time.sleep(0.1 * retry_count)  # Exponential backoff
        except Exception as e:
            retry_count += 1
            if retry_count >= max_retries:
                log(f"✗ Chunk submission error: {e}", RED)
            time.sleep(0.1 * retry_count)

def submit_inference_response(token, request_id, response, error=None, reasoning=None):
    """Submit inference response back to console"""
    data = {
        "id": request_id,
        "status": "completed" if response else "failed",
        "response": response,
        "reasoning": reasoning,
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

def handle_websocket_inference(token, message, ws=None):
    """Handle inference request received via WebSocket"""
    # Extract job_id early so it's available in exception handler
    job_id = message.get('jobId') or message.get('id')
    
    try:
        model = message.get('model', 'llama3.2')
        messages = message.get('messages', [])
        
        log(f"📥 WebSocket job {job_id[:8]}...", BLUE)
        
        # Notify server we're starting (busy status)
        if ws:
            ws.send(json.dumps({
                "type": "status",
                "status": "busy"
            }))
        
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
        
        # Call Ollama with streaming
        ollama_data = {
            "model": model,
            "prompt": prompt,
            "stream": True
        }
        
        ollama_req = Request(
            "http://127.0.0.1:11434/api/generate",
            data=json.dumps(ollama_data).encode('utf-8'),
            headers={'Content-Type': 'application/json'},
            method='POST'
        )
        
        full_response = ""
        full_reasoning = ""
        
        with urlopen(ollama_req, timeout=300) as ollama_response:
            # Stream directly - send via WebSocket if available, otherwise HTTP
            for line in ollama_response:
                if line:
                    chunk = json.loads(line.decode())
                    
                    # Handle reasoning models (dual stream)
                    reasoning_chunk = chunk.get("reasoning", "")
                    response_chunk = chunk.get("response", "")
                    done = chunk.get("done", False)
                    
                    if reasoning_chunk:
                        full_reasoning += reasoning_chunk
                        
                    if response_chunk:
                        full_response += response_chunk
                    
                    # Send token immediately via WebSocket (0ms overhead!)
                    if ws and (reasoning_chunk or response_chunk):
                        try:
                            # Add timestamp for latency tracing
                            send_ts = int(time.time() * 1000)
                            ws.send(json.dumps({
                                "type": "token",
                                "jobId": job_id,
                                "token": response_chunk,
                                "reasoning": reasoning_chunk,
                                "done": done,
                                "agentTs": send_ts  # Timestamp when agent sends
                            }))
                        except Exception as e:
                            log(f"✗ WebSocket send error: {e}", RED)
                    elif not ws:
                        # Fallback to HTTP (slow, 80-120ms overhead per chunk)
                        if reasoning_chunk:
                            submit_inference_chunk(token, job_id, reasoning_chunk, done, content_type="reasoning")
                        if response_chunk:
                            submit_inference_chunk(token, job_id, response_chunk, done, content_type="response")
        
        # Send job completion
        if ws:
            ws.send(json.dumps({
                "type": "job_complete",
                "jobId": job_id
            }))
            # Switch back to idle
            ws.send(json.dumps({
                "type": "status",
                "status": "idle"
            }))
        else:
            submit_inference_response(token, job_id, full_response, reasoning=full_reasoning)
        
        log(f"✓ WebSocket inference completed", GREEN)
        
    except Exception as e:
        log(f"✗ WebSocket inference error: {e}", RED)
        if ws:
            try:
                ws.send(json.dumps({
                    "type": "job_error",
                    "jobId": job_id,
                    "error": str(e)
                }))
                ws.send(json.dumps({
                    "type": "status",
                    "status": "idle"
                }))
            except:
                pass
        else:
            submit_inference_response(token, job_id, None, str(e))

def run_websocket_mode(token):
    """Run agent in WebSocket mode for real-time streaming"""
    if not HAS_WEBSOCKET:
        log(f"⚠ websocket-client not installed, falling back to HTTP mode", YELLOW)
        log(f"  Install with: pip3 install websocket-client", YELLOW)
        return False
    
    # Convert http:// to ws:// for WebSocket connection
    ws_url = API_BASE.replace("http://", "ws://").replace("https://", "wss://")
    ws_url = f"{ws_url}/ws?nodeId={NODE_ID}&token={token}"
    
    log(f"🔌 Connecting to WebSocket...", BLUE)
    log(f"   Full URL: {ws_url}", BLUE)
    log(f"   API_BASE: {API_BASE}", BLUE)
    
    def on_message(ws, message):
        try:
            data = json.loads(message)
            msg_type = data.get('type')
            
            if msg_type == 'job':
                # Handle inference in background thread to not block WebSocket
                log(f"📥 Received job push from server", GREEN)
                thread = threading.Thread(
                    target=handle_websocket_inference,
                    args=(token, data, ws),
                    daemon=True
                )
                thread.start()
            elif msg_type == 'registered':
                log(f"✓ Agent registered with server", GREEN)
                
        except Exception as e:
            log(f"✗ WebSocket message error: {e}", RED)
    
    def on_error(ws, error):
        log(f"✗ WebSocket error: {error}", RED)
        log(f"   Error type: {type(error).__name__}", RED)
        import traceback
        traceback.print_exc()
    
    def on_close(ws, close_status_code, close_msg):
        log(f"⚠ WebSocket disconnected (code={close_status_code}, msg={close_msg})", YELLOW)
    
    def on_open(ws):
        log(f"✓ WebSocket connected - Real-time mode active!", GREEN)
        log(f"  Waiting for inference requests...", GREEN)
        
        # Send heartbeats in background
        def heartbeat_loop():
            while True:
                try:
                    ready, model_count, model_names = check_ollama_ready()
                    send_heartbeat(token, ready, model_count, model_names)
                    time.sleep(10)
                except Exception as e:
                    log(f"✗ Heartbeat error: {e}", RED)
                    break
        
        thread = threading.Thread(target=heartbeat_loop, daemon=True)
        thread.start()
    
    try:
        ws = websocket.WebSocketApp(
            ws_url,
            on_open=on_open,
            on_message=on_message,
            on_error=on_error,
            on_close=on_close
        )
        
        # Run with SSL for wss:// connections
        import ssl
        ssl_context = None
        if ws_url.startswith("wss://"):
            ssl_context = ssl.create_default_context()
            ssl_context.check_hostname = True
            ssl_context.verify_mode = ssl.CERT_REQUIRED
        
        # Run forever (blocks until disconnected)
        ws.run_forever(sslopt={"cert_reqs": ssl.CERT_NONE} if ssl_context else None)
        
        # If we get here, WebSocket disconnected - return False to trigger HTTP fallback
        log(f"⚠ WebSocket run_forever() ended", YELLOW)
        return False
        
    except Exception as e:
        log(f"✗ WebSocket connection failed: {e}", RED)
        import traceback
        traceback.print_exc()
        return False

def main():
    """Main agent loop"""
    print(f"""
{BLUE}╔══════════════════════════════════════════════════╗
║          DGON Node Agent - Ollama Runtime        ║
╚══════════════════════════════════════════════════╝{RESET}

Configuration:
  API Base:  {API_BASE}
  Node ID:   {NODE_ID}
  Region:    {REGION}
  Runtime:   {RUNTIME}

""", flush=True)
    
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
    log(f"🚀 Starting agent...", BLUE)
    
    # Try WebSocket mode first (real-time streaming)
    if HAS_WEBSOCKET and ready:
        log(f"   Mode: WebSocket (real-time streaming)", GREEN)
        log(f"   Press Ctrl+C to stop", BLUE)
        log(f"", "")
        
        try:
            ws_result = run_websocket_mode(token)
            if ws_result:
                # WebSocket ran successfully, no need for HTTP fallback
                return
            else:
                log(f"⚠ WebSocket connection failed, falling back to HTTP polling", YELLOW)
        except KeyboardInterrupt:
            log(f"", "")
            log(f"👋 Agent stopped by user", YELLOW)
            sys.exit(0)
        except Exception as e:
            log(f"⚠ WebSocket error: {e}, falling back to HTTP polling", YELLOW)
    else:
        if not HAS_WEBSOCKET:
            log(f"⚠ WebSocket library not installed (pip3 install websocket-client)", YELLOW)
    
    # Fallback to HTTP polling mode
    log(f"   Mode: HTTP polling (optimized)", YELLOW)
    log(f"   Heartbeat: every 10 seconds", BLUE)
    log(f"   Inference polling: every 100ms", BLUE)
    log(f"   Press Ctrl+C to stop", BLUE)
    log(f"", "")
    
    # Main loop with both heartbeat and inference polling
    last_heartbeat = time.time()
    error_backoff = 0.1  # Start with 100ms, increase on errors
    
    try:
        while True:
            try:
                # Send heartbeat every 10 seconds
                if time.time() - last_heartbeat >= 10:
                    ready, model_count, model_names = check_ollama_ready()
                    send_heartbeat(token, ready, model_count, model_names)
                    last_heartbeat = time.time()
                
                # Poll for inference requests if node is ready
                ready, model_count, model_names = check_ollama_ready()
                if ready:
                    poll_for_inference_requests(token)
                
                # Reset backoff on success
                error_backoff = 0.1
                
                # FIX #1: Fast polling - 100ms instead of 500ms
                time.sleep(0.1)
                
            except Exception as e:
                # Exponential backoff on errors (max 2 seconds)
                log(f"⚠ Poll error: {e}", YELLOW)
                time.sleep(error_backoff)
                error_backoff = min(error_backoff * 2, 2.0)
    except KeyboardInterrupt:
        log(f"", "")
        log(f"👋 Agent stopped by user", YELLOW)
        sys.exit(0)

if __name__ == "__main__":
    # Immediate startup confirmation for Windows compatibility
    print("DGON Agent starting...", flush=True)
    sys.stdout.flush()
    main()
