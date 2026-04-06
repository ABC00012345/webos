const terminal = document.getElementById('terminal');
let currentInput = null;
let line = null;

// GLOBALS
let cwd = [];
let cwdPath = "/";
let commandStack = [];
let historyPosition = -1;
let currentInputBeforeHistory = '';
let editViewOpened = false;
let oldCwd = "/";

// disable console.log, improves speed by like 10x, espec. in wpl
//console.log = function() {}

// UTILS
class Utils {
    static helpMessage = `
Hello, welcome to WebOS!

This is a simple web-based operating system.

Commands:
- ls:     List files in the current directory
- cd:     Change directory
- cat:    Read file content
- echo:   Print text to the terminal
- mkdir:  Create a new directory
- rmdir:  Remove a directory
- rmdirf: Remove a directory (force)
- rm:     Remove a file
- rmf:    Remove a file (force)
- touch:  Create a new file
- pwd:    Print working directory
- write:  Write to a file
- mv:     Move or rename a file/directory
- cp:     Copy a file/directory
- exist:  Check if a file/directory exists
- append: Append content to a file
- load:   Load a module
- loadall: Load all modules
- unload: Unload a module
- modinfo: Show loaded and available modules
- help:   Show this help message
- clear:  Clear the terminal
- date:  Show current date and time
- randint: Generate random numbers
- randfloat: Generate random float numbers
- randstring: Generate random alphanumeric strings
- reboot: Reboot the system
- exit: Shutdown the system
- edit: File editor
- history: Display command history
- ping: Ping a host
- fetch: Save response data of server to file
- run: executes a script
- wpl: executes a file of the webos programming language
- autoload: sets a module as autoload
- unautoload: disables autoload for a module
- oldwpl: use old version of wpl programming language (not compatble with new version)
- export: export a file from WebOS and download it
- import: import a file from your computer to WebOS
- size: show the size of a file or directory

Audio commands:
- aload: load an audio file (supports mp3, wav, ogg)
- aplay: play loaded audio
- apause: pause audio
- astats: show audio status (playing/paused, current time, duration)


Important information:
- autoload modules: create a file named autoload in directory /modules/<modulename>/
- files of the webos programming language need to start with #wpl to be executable, just like #script for normal scripts

More coming soon!!

Enjoy your experience!
`;
    static wplCommands = {
        "helloworld" : `#wpl
PRINT "Hello, World!"`,
        "audioplayer" : `#wpl
IMPORT wpl/audio

WHILE true START
    LET cmd = INPUT "Command (load/play/pause/seek/volume/status/exit): "

    IF cmd == "load" THEN
        LET filename = INPUT "Filename: "
        LET res = Audio.load(filename)
        PRINT "Loaded: " + filename
    END

    IF cmd == "play" THEN
        Audio.play()
        PRINT "Playing..."
    END

    IF cmd == "pause" THEN
        Audio.pause()
        PRINT "Paused."
    END

    IF cmd == "seek" THEN
        LET t = INPUT "Seek to (seconds): "
        Audio.seek(t)
    END

    IF cmd == "volume" THEN
        LET v = INPUT "Volume (0-1): "
        Audio.setVolume(v)
    END

    IF cmd == "status" THEN
        PRINT "Playing: " + Audio.isPlaying()
        PRINT "Time: " + Audio.getCurrentTime() + "/" + Audio.getDuration()
    END

    IF cmd == "exit" THEN
        PRINT "Bye!"
        RETURN
    END
END        
`
    }
    static wplModules = {
        "audio.wpl" : `#wpl
EXEC load audio

LET _woplAudioPlayer = NEW WOPLAudioPlayer()
CLASS _AudioPlayer

	METHOD INIT
		
	END METHOD

	METHOD isPlaying
		RETURN _woplAudioPlayer.isPlaying
	END METHOD

	METHOD load PARAM src
		LET res = _woplAudioPlayer.load(src)
		RETURN res
	END METHOD

	METHOD play
		_woplAudioPlayer.play()
	END METHOD

	METHOD pause
		_woplAudioPlayer.pause()
	END METHOD

    METHOD getCurrentTime
        RETURN _woplAudioPlayer.getCurrentTime()
	END METHOD

    METHOD getDuration
        RETURN _woplAudioPlayer.getDuration()
    END METHOD

    METHOD setVolume PARAM v
        _woplAudioPlayer.setVolume(v)
    END METHOD

    METHOD seek PARAM seconds
        _woplAudioPlayer.seek(seconds)
    END METHOD

END CLASS

LET Audio = NEW _AudioPlayer()        
`
    }
    // maybe move all system created files here
}

// DATE
class DateUtils {
    getCurrentDate() {
        const date = new Date();
        return date.toLocaleString();
    }
    getCurrentTime() {
        const date = new Date();
        return date.toLocaleTimeString();
    }
    getUnixTimestamp() {
        return Math.floor(Date.now() / 1000);
    }
    getUnixMSTimestamp() {
        return Date.now();
    }
}

class AudioPlayer {
    constructor() {
        this.ctx = new (window.AudioContext || window.webkitAudioContext)();

        this.currentSource = null;
        this.currentBuffer = null;

        this.isPlaying = false;
        this.startTime = 0;
        this.pauseOffset = 0;

        this.gainNode = this.ctx.createGain();
        this.gainNode.connect(this.ctx.destination);
    }

    async load(bytes) {
        this.currentBuffer = await this.ctx.decodeAudioData(
            bytes.buffer ? bytes.buffer.slice(0) : bytes
        );
        this.pauseOffset = 0;
    }

    play() {
        if (!this.currentBuffer) {
            console.warn("No audio loaded");
            return;
        }

        if (this.isPlaying) return;

        const source = this.ctx.createBufferSource();
        source.buffer = this.currentBuffer;
        source.connect(this.gainNode);

        source.start(0, this.pauseOffset);

        this.startTime = this.ctx.currentTime - this.pauseOffset;
        this.currentSource = source;
        this.isPlaying = true;

        source.onended = () => {
            if (this.isPlaying) {
                this.stop();
            }
        };
    }

    pause() {
        if (!this.isPlaying) return;

        this.pauseOffset = this.ctx.currentTime - this.startTime;

        this.currentSource.stop();
        this.currentSource = null;

        this.isPlaying = false;
    }

    stop() {
        if (this.currentSource) {
            this.currentSource.stop();
            this.currentSource = null;
        }

        this.pauseOffset = 0;
        this.isPlaying = false;
    }

    setVolume(v) {
        this.gainNode.gain.value = v; // 0.0 → 1.0
    }

    seek(seconds) {
        if (!this.currentBuffer) return;

        this.pauseOffset = seconds;

        if (this.isPlaying) {
            this.currentSource.stop();
            this.isPlaying = false;
            this.play();
        }
    }

    getCurrentTime() {
        if (!this.isPlaying) return this.pauseOffset;
        return this.ctx.currentTime - this.startTime;
    }

    getDuration() {
        return this.currentBuffer ? this.currentBuffer.duration : 0;
    }
}

// only works in console for now
class YTPlayer {
  static apiReadyPromise = null;

  static loadAPI() {
    if (window.YT?.Player) return Promise.resolve();

    if (!YTPlayer.apiReadyPromise) {
      YTPlayer.apiReadyPromise = new Promise((resolve) => {
        window.onYouTubeIframeAPIReady = resolve;

        if (!document.querySelector('script[src="https://www.youtube.com/iframe_api"]')) {
          const script = document.createElement("script");
          script.src = "https://www.youtube.com/iframe_api";
          document.head.appendChild(script);
        }
      });
    }

    return YTPlayer.apiReadyPromise;
  }

  constructor(containerId = "yt-player-hidden") {
    this.player = null;
    this.ready = false;
    this.containerId = containerId;

    this.readyPromise = new Promise((resolve) => {
      this._resolveReady = resolve;
    });

    let el = document.getElementById(containerId);
    if (!el) {
      el = document.createElement("div");
      el.id = containerId;
      Object.assign(el.style, {
        position: "absolute",
        left: "-1px",
        top: "-1px",
        width: "1px",
        height: "1px",
        opacity: "0",
        pointerEvents: "none",
        overflow: "hidden",
      });
      document.body.appendChild(el);
    }

    YTPlayer.loadAPI().then(() => {
      this.player = new YT.Player(containerId, {
        width: "1",
        height: "1",
        videoId: "",
        playerVars: { playsinline: 1 },
        events: {
          onReady: () => {
            this.ready = true;
            this._resolveReady();
          },
          onError: (e) => console.error("YTPlayer error:", e.data),
        },
      });
    });
  }

  getVideoId(input) {
    if (!input) return null;
    if (/^[a-zA-Z0-9_-]{11}$/.test(input)) return input;
    try {
      const url = new URL(input);
      return url.searchParams.get("v") ||
        url.pathname.split("/").filter(Boolean).pop() || null;
    } catch {
      const match = input.match(/v=([^&]+)/) || input.match(/youtu\.be\/([^?&]+)/);
      return match ? match[1] : null;
    }
  }

  getPlaylistId(input) {
    if (!input) return null;
    try {
        const url = new URL(input);
        const list = url.searchParams.get("list");
        // RDMM and RD* are mix/radio playlists — not embeddable
        if (list && (list.startsWith("RD") || list === "RDMM")) return null;
        return list;
    } catch {
        const match = input.match(/list=([^&]+)/);
        if (!match) return null;
        const list = match[1];
        if (list.startsWith("RD") || list === "RDMM") return null;
        return list;
    }
    }

    async play(input) {
    if (!input) throw new Error("play() requires a video ID or URL");
    await this.readyPromise;

    const videoId = this.getVideoId(input);
    const playlistId = this.getPlaylistId(input);
    const indexMatch = typeof input === "string" ? input.match(/[?&]index=(\d+)/) : null;
    const index = indexMatch ? parseInt(indexMatch[1], 10) : 0;

    if (playlistId && videoId) {
        // Load video + attach playlist context so next/previous work
        this.player.loadVideoById({
        videoId,
        list: playlistId,
        listType: "playlist",
        index,
        });
    } else if (playlistId) {
        // Playlist URL without explicit video ID
        this.player.loadPlaylist({
        listType: "playlist",
        list: playlistId,
        index,
        });
    } else if (videoId) {
        this.player.loadVideoById(videoId);
    } else {
        throw new Error("Could not extract video or playlist ID from: " + input);
    }
    }

  async togglePlay() {
    await this.readyPromise;
    const state = this.player.getPlayerState();
    if (state === YT.PlayerState.PLAYING) this.player.pauseVideo();
    else this.player.playVideo();
  }

  async playVideo() {
    await this.readyPromise;
    this.player.playVideo();
  }

  async pause() {
    await this.readyPromise;
    this.player.pauseVideo();
  }

  async next() {
    await this.readyPromise;
    this.player.nextVideo();
  }

  async previous() {
    await this.readyPromise;
    this.player.previousVideo();
  }

  async setVolume(v) {
    await this.readyPromise;
    this.player.setVolume(Math.max(0, Math.min(100, v)));
  }

  async getVolume() {
    await this.readyPromise;
    return this.player.getVolume();
  }

  async getDuration() {
    await this.readyPromise;
    return this.player.getDuration();
  }

  async getCurrentTime() {
    await this.readyPromise;
    return this.player.getCurrentTime();
  }

  async seekTo(seconds) {
    await this.readyPromise;
    this.player.seekTo(seconds, true);
  }

  isPlaying() {
    return this.ready && this.player.getPlayerState() === YT.PlayerState.PLAYING;
  }
}
 
// RANDOM
class RandomUtils {
    // Returns a random integer between min and max (inclusive)
    getRandomInt(min, max) {
        min = Math.ceil(min);
        max = Math.floor(max);
        if (min > max) [min, max] = [max, min];
        return Math.floor(Math.random() * (max - min + 1)) + min;
    }

    // Returns a random float between min (inclusive) and max (exclusive)
    getRandomFloat(min, max) {
        if (min > max) [min, max] = [max, min];
        return Math.random() * (max - min) + min;
    }

    // Returns a random alphanumeric string of the given length
    getRandomString(length) {
        length = parseInt(length);
        if (length <= 0 || isNaN(length)) return '';
        
        const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
        let result = '';
        
        for (let i = 0; i < length; i++) {
            result += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        
        return result;
    }
}

// netowrk module
class Network {
    constructor() {
        this.inUse = false;
        this.currentPing = null;
    }

    ping(ip) {
        if (this.inUse) {
            // Immediately return a rejected promise and a no-op cancel
            return [Promise.reject(new Error("Ping already in use")), () => {}];
        }

        this.inUse = true;
        const controller = new AbortController();
        const start = Date.now();

        let timeoutId;
        let canceled = false;

        // Create the promise
        const resultPromise = new Promise((resolve, reject) => {
            // Timeout
            timeoutId = setTimeout(() => {
                controller.abort(); // abort fetch
            }, 2000);

            fetch(`http://${ip}/?ping=${Date.now()}`, {
                method: "HEAD",
                mode: "no-cors",
                signal: controller.signal
            })
            .then(() => {
                clearTimeout(timeoutId);
                this.inUse = false;
                this.currentPing = null;
                resolve({ success: true, ip, latency: Date.now() - start });
            })
            .catch(err => {
                clearTimeout(timeoutId);
                this.inUse = false;
                this.currentPing = null;
                if (err.name === "AbortError") {
                    if(canceled){
                        resolve({ success: false, ip, error: "Canceled" });
                    } else {
                        resolve({ success: false, ip, error: "Timeout" });
                    }
                } else {
                    resolve({ success: false, ip, error: "Unreachable" });
                }
            });
        });

        // Create a cancel function
        const cancel = () => {
            canceled = true;
            controller.abort();
            clearTimeout(timeoutId);
            this.inUse = false;
            this.currentPing = null;
        };

        // Store cancel for potential external use
        this.currentPing = { cancel };

        // Return both promise and cancel function as a tuple
        return [resultPromise, cancel];
    }

    fetch(ip) {
        if (this.inUse) {
            // Immediately return a rejected promise and a no-op cancel
            return [Promise.reject(new Error("Ping already in use")), () => {}];
        }

        this.inUse = true;
        const controller = new AbortController();
        const start = Date.now();

        let timeoutId;
        let canceled = false;

        // Create the promise
        const resultPromise = new Promise((resolve, reject) => {
            // Timeout
            timeoutId = setTimeout(() => {
                controller.abort(); // abort fetch
            }, 2000);

            fetch(`http://${ip}`, {
                signal: controller.signal
            })
            .then(res => {
                clearTimeout(timeoutId);
                this.inUse = false;
                this.currentPing = null;
                resolve({ success: true, ip, data: res.text()});
            })
            .catch(err => {
                clearTimeout(timeoutId);
                this.inUse = false;
                this.currentPing = null;
                if (err.name === "AbortError") {
                    if(canceled){
                        resolve({ success: false, ip, error: "Canceled" });
                    } else {
                        resolve({ success: false, ip, error: "Timeout" });
                    }
                } else {
                    resolve({ success: false, ip, error: "Unreachable/CORS Err" });
                }
            });
        });

        // Create a cancel function
        const cancel = () => {
            canceled = true;
            controller.abort();
            clearTimeout(timeoutId);
            this.inUse = false;
            this.currentPing = null;
        };

        // Store cancel for potential external use
        this.currentPing = { cancel };

        // Return both promise and cancel function as a tuple
        return [resultPromise, cancel];
    }
}

// Graphics/GUI module
class Graphics {
    constructor() {
        this.canvas = null;
        this.ctx = null;
        this.width = 800;
        this.height = 600;
        this.isInitialized = false;
    }

    // Initialize the canvas and replace terminal
    init(width = 800, height = 600) {
        if (this.isInitialized) {
            return { success: false, error: "Graphics already initialized" };
        }

        this.width = width;
        this.height = height;

        // Get terminal element
        const terminal = document.getElementById('terminal');
        
        // Clear terminal
        terminal.innerHTML = '';

        // Create canvas
        this.canvas = document.createElement('canvas');
        this.canvas.width = this.width;
        this.canvas.height = this.height;
        this.canvas.style.border = '1px solid #00ff00';
        this.canvas.style.backgroundColor = '#000';
        this.canvas.style.imageRendering = 'pixelated'; // For crisp pixel art
        
        // Add canvas to terminal
        terminal.appendChild(this.canvas);

        // Get 2D context
        this.ctx = this.canvas.getContext('2d');
        
        // Set default styles
        this.ctx.fillStyle = '#00ff00';
        this.ctx.strokeStyle = '#00ff00';
        this.ctx.font = '16px monospace';

        this.isInitialized = true;

        return { success: true };
    }

    // Close graphics mode and restore terminal
    close() {
        if (!this.isInitialized) {
            return { success: false, error: "Graphics not initialized" };
        }

        const terminal = document.getElementById('terminal');
        terminal.innerHTML = '';
        
        this.canvas = null;
        this.ctx = null;
        this.isInitialized = false;

        // Recreate input line
        createInputLine();

        return { success: true };
    }

    // Check if initialized
    checkInit() {
        if (!this.isInitialized) {
            throw new Error("Graphics not initialized. Use GINIT first.");
        }
    }

    // same as above but returns just true/false and no error
    isUsed() {
        return this.isInitialized;
    }

    // Clear screen
    clear(color = '#000000') {
        this.checkInit();
        this.ctx.fillStyle = color;
        this.ctx.fillRect(0, 0, this.width, this.height);
    }

    // Draw pixel
    drawPixel(x, y, color = '#00ff00') {
        this.checkInit();
        this.ctx.fillStyle = color;
        this.ctx.fillRect(x, y, 1, 1);
    }

    // Draw line
    drawLine(x1, y1, x2, y2, color = '#00ff00', width = 1) {
        this.checkInit();
        this.ctx.strokeStyle = color;
        this.ctx.lineWidth = width;
        this.ctx.beginPath();
        this.ctx.moveTo(x1, y1);
        this.ctx.lineTo(x2, y2);
        this.ctx.stroke();
    }

    // Draw rectangle (outline)
    drawRect(x, y, w, h, color = '#00ff00', width = 1) {
        this.checkInit();
        this.ctx.strokeStyle = color;
        this.ctx.lineWidth = width;
        this.ctx.strokeRect(x, y, w, h);
    }

    // Draw filled rectangle
    fillRect(x, y, w, h, color = '#00ff00') {
        this.checkInit();
        this.ctx.fillStyle = color;
        this.ctx.fillRect(x, y, w, h);
    }

    // Draw circle (outline)
    drawCircle(x, y, radius, color = '#00ff00', width = 1) {
        this.checkInit();
        this.ctx.strokeStyle = color;
        this.ctx.lineWidth = width;
        this.ctx.beginPath();
        this.ctx.arc(x, y, radius, 0, Math.PI * 2);
        this.ctx.stroke();
    }

    // Draw filled circle
    fillCircle(x, y, radius, color = '#00ff00') {
        this.checkInit();
        this.ctx.fillStyle = color;
        this.ctx.beginPath();
        this.ctx.arc(x, y, radius, 0, Math.PI * 2);
        this.ctx.fill();
    }

    // Draw text
    drawText(x, y, text, color = '#00ff00', size = 16) {
        this.checkInit();
        this.ctx.fillStyle = color;
        this.ctx.font = `${size}px monospace`;
        this.ctx.fillText(text, x, y);
    }

    // Get canvas dimensions
    getWidth() {
        return this.width;
    }

    getHeight() {
        return this.height;
    }

    // Get mouse position on canvas, returns {x: -1, y: -1} if mouse is not on canvas
    getMousePos() {
        this.checkInit();

        let mouseX = -1;
        let mouseY = -1;

        if (!this._mouseMoveListener) {
            this._mouseMoveListener = (e) => {
                const rect = this.canvas.getBoundingClientRect();
                const scaleX = this.width / rect.width;
                const scaleY = this.height / rect.height;

                this._mouseX = Math.floor((e.clientX - rect.left) * scaleX);
                this._mouseY = Math.floor((e.clientY - rect.top) * scaleY);
            };

            this._mouseLeaveListener = () => {
                this._mouseX = -1;
                this._mouseY = -1;
            };

            this.canvas.addEventListener('mousemove', this._mouseMoveListener);
            this.canvas.addEventListener('mouseleave', this._mouseLeaveListener);
        }

        return {
            x: this._mouseX ?? -1,
            y: this._mouseY ?? -1
        };
    }
}

// WebOSProgrammingLanguage
class WebOSPLang {
    constructor(execHandler = null) {
        this.vars = {};
        this.functions = {};
        this.execHandler = execHandler; // optional integration with WebOS commands
        this.globalOutput = "";
        this.globLine;
        this.outputDirectly = false;
        this.setInterruptExecutionFlag = this.setInterruptExecutionFlag.bind(this);
        this.keydownHandler = this.keydownHandler.bind(this);
        this.keyupHandler = this.keyupHandler.bind(this);
        this.keys = {};
        this.initCmds();
    }

    initCmds(){
        /*for(let cmd in commandManager.availableCommands){
            console.log(cmd);
            //this.functions[cmd] = 
        }*/

    }

    async run(code, outputDirectly = false) {
        //console.log("CALLLEDDD!!!!"+code)
        this.vars = {};
        this.functions = {};
        this.globalOutput = ""
        this.outputDirectly = outputDirectly;
        this.error = false;
        this.errorDesc = "";
        this.interruptExecution = false;
        this.errorAlreadyReported = false;
        this.breakLoop = false;
        this.contLoop = false;

        // store key presses
        this.keys = {};

        document.addEventListener('keydown', this.setInterruptExecutionFlag);
        document.addEventListener('keydown', this.keydownHandler);
        document.addEventListener('keyup', this.keyupHandler);

        const lines = code.split("\n").map(l => l.trim()).filter(l => l.length > 0);
        let [out] = await this.executeBlock(lines, 0);
        console.log(this.vars);
        console.log(this.functions);
        document.removeEventListener('keydown', this.setInterruptExecutionFlag);

        document.removeEventListener('keydown', this.keydownHandler);
        document.removeEventListener('keyup', this.keyupHandler);
        return this.globalOutput;
    }

    keydownHandler(e){
        this.keys[e.key] = true;
        console.log("Key down:", e.key);  // Debug
    }

    keyupHandler(e){
        this.keys[e.key] = false;
        console.log("Key up:", e.key);  // Debug
    }

    iskeyDown(key) {
        return !!this.keys[key];
    }

    setInterruptExecutionFlag(){
        if (event.ctrlKey && event.key.toLowerCase() === 'c') {
            console.log("INTERRUPT");
            this.interruptExecution = true;
        }
    }

    // ----- MAIN BLOCK EXECUTION -----
    async executeBlock(lines, startIndex, isFunctionBody = false, insideLoopBody = false) {
        let output = ""; // output is only for function return!!!!!
        // globalOutput is output of the programm!!!!!!
        let i = startIndex;
        let returnValue = null;
        let hasReturned = false;

        while (i < lines.length && !hasReturned && !this.error) {
            // Check for break/continue flags at the START of each line
            if (insideLoopBody) {
                console.log("DETECTED!!");
                if (this.breakLoop) {
                    console.log("BREAK detected at line start - stopping block execution");
                    // set this in loop func: //this.breakLoop = false;
                    return [output, i, returnValue];
                }
                if (this.contLoop) {
                    console.log("CONTINUE detected at line start - stopping block execution");
                    //this.contLoop = false;
                    return [output, lines.length, returnValue]; // Return end of block
                }
            }
            
            const line = lines[i];
            
            console.log("LINE: "+line);
            if(!isFunctionBody){ this.globLine = i+1};
            console.log("Line: "+this.globLine+ (isFunctionBody ? " (Inside Function)":""));
            
            if (this.interruptExecution) {
                break;
            }

            // immediately skip comments
            if (line.startsWith("//") || line.startsWith("#")) {
                i++;
                continue;
            }

            if (line.startsWith("LET ")) {
                await this.handleLet(line);
            }
            else if (line.startsWith("PRINT ")) {
                let print_expr = line.substring(6);
                let out = this.evalExpr(print_expr, false);
                console.log("Adding to output: "+out);
                //output += out + "\n";
                this.globalOutput+=out + "\n";

                if(this.outputDirectly){
                    // IMMEDIATE OUTPUT TO TERMINAL
                    this.outputToTerminalImmediately(out);
                }
            }
            // input until enter pressed
            else if (line.startsWith("INPUT ")) {
                await this.handleInput(line);
            }
            else if (line.startsWith("IF ")) {
                const [out, skipTo] = await this.handleIf(lines, i);
                // !!!! output handled by if block itself,
                // cuz it calls executeBlock and e.g. if block contains PRINT
                //  it calls print in here and this already adds to output
                //output += out;
                i = skipTo;
                console.log("NEW I: "+ i)
                continue;
            }
            else if (line.startsWith("WHILE ")) {
                const [out, skipTo] = await this.handleWhile(lines, i);
                
                
                i = skipTo;
                continue;
            }
            else if (line.startsWith("ITER ")) {
                i = await this.handleLoop(lines, i);
                continue;
            }
            else if (line.startsWith("FUNCTION ")) {
                i = this.handleFunction(lines, i);
                continue;
            }
            else if (line.startsWith("CALL ")) {
                // For function calls within functions, we need to handle the return value
                const result = await this.handleCall(line);
                if (isFunctionBody) {
                    // In function context, store the result but continue execution
                    // Actual RETURN statement will handle the final return value
                }
            }
            else if (line.startsWith("EXEC ")) {
                let result = await this.handleExec(line) + "\n";
            }
            else if (line.startsWith("BREAK")) {
                console.log("BREAK encountered - setting flag");
                this.breakLoop = true;
                
                // If we're inside a loop body, break immediately
                if (insideLoopBody) {
                    break;
                }
            }
            else if (line.startsWith("CONTINUE")) {
                console.log("CONTINUE encountered - setting flag");
                this.contLoop = true;
                
                // If we're inside a loop body, break immediately
                if (insideLoopBody) {
                    break;
                }
            }
            else if (line.startsWith("RETURN ") && isFunctionBody) {
                const returnExpr = line.substring(7);
                returnValue = this.evalExpr(returnExpr, true);
                hasReturned = true;
                break;
            }
            // list syntax
            else if (line.startsWith("APPEND ")) {
                this.handleAppend(line);
            }
            else if (line.startsWith("REMOVE ")) {
                this.handleRemove(line);
            }
            else if (line.startsWith("SET ") && line.includes(" AT ")) {
                this.handleSetAt(line);
            }
            else if (line.startsWith("CLEAR ")) {
                this.handleClear(line);
            }
            // graphics:
            else if (line.startsWith("GINIT")) {
                this.handleGInit(line);
            }
            else if (line.startsWith("GCLOSE")) {
                this.handleGClose();
            }
            else if (line.startsWith("GCLEAR")) {
                this.handleGClear(line);
            }
            else if (line.startsWith("GPIXEL ")) {
                this.handleGPixel(line);
            }
            else if (line.startsWith("GLINE ")) {
                this.handleGLine(line);
            }
            else if (line.startsWith("GRECT ")) {
                this.handleGRect(line);
            }
            else if (line.startsWith("GFRECT ")) {
                this.handleGFRect(line);
            }
            else if (line.startsWith("GCIRCLE ")) {
                this.handleGCircle(line);
            }
            else if (line.startsWith("GFCIRCLE ")) {
                this.handleGFCircle(line);
            }
            else if (line.startsWith("GTEXT ")) {
                this.handleGText(line);
            }
            else if (line.startsWith("SLEEP ")) {
                await this.handleSleep(line);
            }

            i++;
        }

        // Final check for break/continue when exiting the block
        /*if (insideLoopBody) {
            if (this.breakLoop) {
                console.log("BREAK detected at block end");
                this.breakLoop = false;
            }
            if (this.contLoop) {
                console.log("CONTINUE detected at block end");
                this.contLoop = false;
            }
        }*/

        if(this.interruptExecution){
            this.throwError("(ERR: Execution interrupted by user)");
        }
        // this flag is needed, otherwise it would print the error multiple times cuz of recursion: executeBlock is called multiple times for example inside loops,functions,...
        if(this.error && !this.errorAlreadyReported){
            this.globalOutput = this.errorDesc + "\n";
            if(this.outputDirectly){
                this.outputToTerminalImmediately(this.errorDesc + "\n", "red");
            }
            this.errorAlreadyReported = true;
        }
        //this.globalOutput+=output;
        return [output, i, returnValue];
    }

    /*readChar() {
        return new Promise(resolve => {
            function handler(e) {
            // Remove listener so it only fires once
            window.removeEventListener("keydown", handler);

            // e.key is already the character (or key name)
            resolve(e.key);
            }

            window.addEventListener("keydown", handler);
        });
    }*/

    async handleSleep(line){
        const msMatch = line.match(/SLEEP\s+(.+)/);
        if (msMatch) {
            let ms = this.evalExpr(msMatch[1], true);
            ms = parseInt(ms);
            const start = Date.now();
            
            while (Date.now() - start < ms) {
                // Yield control back to event loop every 16ms (about 60fps)
                await new Promise(resolve => setTimeout(resolve, 16));
                
                // need to test if it works here
                await new Promise(requestAnimationFrame);

                // Check for interrupt during sleep
                if (this.interruptExecution) {
                    break;
                }
            }
        }
    }

    async handleInput(line) {
        const match = line.match(/INPUT\s+(.+)/);
        if (!match) {
            this.throwError("(ERR: Invalid INPUT syntax)");
            return;
        }

        const promptExpr = match[1].trim();
        let prompt = "";
        
        // Evaluate prompt expression if provided
        if (promptExpr) {
            prompt = this.evalExpr(promptExpr, false);
        }

        // Show prompt immediately
        if (prompt) {
            console.log(prompt.replace("\n",""));
            this.outputToTerminalImmediately(prompt.replace("\n","")/*no newline!!!*/);
        }

        try {
            // Wait for user input
            const userInput = await this.waitForUserInput();
            return userInput;
            // Store input in a special variable or return it
            // For now, we'll store it in a special _INPUT variable
            //this.vars["_INPUT"] = userInput;
            
            // Also output the input (optional - mimics terminal behavior)
            //this.outputToTerminalImmediately(userInput);
            
        } catch (error) {
            this.throwError("(ERR: Input cancelled)");
        }
    }

    waitForUserInput(prompt = "") {
        return new Promise((resolve) => {
            const terminal = document.getElementById('terminal');
            
            // Find the last output line to append input to
            const outputLines = terminal.querySelectorAll('.output-line');
            const lastOutputLine = outputLines[outputLines.length - 1];
            
            let inputContainer;
            
            if (lastOutputLine && !prompt) {
                // If there's a previous output line and no prompt, append input to it
                inputContainer = lastOutputLine;
                
                // Add a space before the input
                const space = document.createTextNode(' ');
                inputContainer.appendChild(space);
            } else {
                // Create a new line for input (with prompt if provided)
                inputContainer = document.createElement('div');
                inputContainer.classList.add('output-line');
                
                if (prompt) {
                    const promptSpan = document.createElement('span');
                    promptSpan.textContent = prompt;
                    promptSpan.style.color = "green"; // Match your output color
                    inputContainer.appendChild(promptSpan);
                }
                
                terminal.appendChild(inputContainer);
            }
            
            // Create the input div
            const inputDiv = document.createElement('div');
            inputDiv.classList.add('cli-input-editable', 'wpl-input', 'inline-input');
            inputDiv.contentEditable = true;
            inputDiv.style.display = 'inline-block';
            inputDiv.style.minWidth = '10px';
            inputDiv.style.color = 'green'; // for now we'll just use green like the rest
            //inputDiv.style.border = '1px solid #ccc'; // Visual indicator
            //inputDiv.style.padding = '2px 4px';
            //inputDiv.style.marginLeft = '4px';
            
            inputContainer.appendChild(inputDiv);
            inputDiv.focus();

            let inputText = "";
            let isResolved = false;

            const handleKeyDown = (event) => {
                if (event.key === 'Enter' && !event.shiftKey) {
                    event.preventDefault();
                    
                    if (!isResolved) {
                        isResolved = true;
                        const finalInput = inputDiv.innerText.trim();
                        
                        // Clean up event listeners
                        inputDiv.removeEventListener('keydown', handleKeyDown);
                        inputDiv.removeEventListener('input', handleInput);
                        
                        // Make input non-editable but keep it visible
                        inputDiv.contentEditable = false;
                        inputDiv.style.border = 'none';
                        inputDiv.style.backgroundColor = 'transparent';
                        
                        resolve(finalInput);
                    }
                }
                else if (event.key === 'Escape') {
                    event.preventDefault();
                    
                    if (!isResolved) {
                        isResolved = true;
                        
                        // Clean up
                        inputDiv.removeEventListener('keydown', handleKeyDown);
                        inputDiv.removeEventListener('input', handleInput);
                        inputContainer.removeChild(inputDiv);
                        
                        resolve(""); // Empty input on escape
                    }
                }
                else if (event.ctrlKey && event.key.toLowerCase() === 'c') {
                    this.interruptExecution = true;
                    resolve();
                }
            };

            const handleInput = () => {
                // Auto-resize
                inputDiv.style.width = 'auto';
                inputDiv.style.width = (inputDiv.scrollWidth + 2) + 'px';
                
                // Store current input
                inputText = inputDiv.innerText;
            };

            inputDiv.addEventListener('keydown', handleKeyDown);
            inputDiv.addEventListener('input', handleInput);

            // Auto-resize initially
            setTimeout(() => {
                inputDiv.style.width = 'auto';
                inputDiv.style.width = (inputDiv.scrollWidth + 2) + 'px';
            }, 0);
        });
    }

    outputToTerminalImmediately(text, col = "green") {
        // Create and append output line directly to terminal
        const outputLine = document.createElement('div');
        outputLine.classList.add('output-line');
        outputLine.textContent = text;
        outputLine.style.color = col; // or whatever color you prefer
        
        // Get the terminal element
        const terminal = document.getElementById('terminal');
        terminal.appendChild(outputLine);
        
        // Scroll to bottom to show new output
        window.scrollTo(0, document.body.scrollHeight);
    }

    // ----- LET -----
    async handleLet(line) {
        const match = line.match(/LET\s+(\w+)\s*=\s*(.+)/);
        if (!match) return;

        const name = match[1];
        const expr = match[2];

        console.log(match);

        console.log("var name: "+name+" expr: "+ expr);

        // Handle LIST creation
        /*if (expr.startsWith("LIST")) {
            const listMatch = expr.match(/LIST\s*(.*)$/);
            if (listMatch[1].trim() === "") {
                // Empty list
                this.vars[name] = [];
            } else {
                // List with values: LIST 1, 2, 3
                const values = listMatch[1].split(",").map(v => this.evalExpr(v.trim(), true));
                this.vars[name] = values;
            }
            console.log("Created list:", name, "=", this.vars[name]);
            return;
        }*/

        /// ALL THESE METHODS WERE MOVED TO evalExpr !
        // access list element
        /*if (expr.includes(" AT ")) {
            const atMatch = expr.match(/(\w+)\s+AT\s+(.+)/);
            if (atMatch) {
                const listName = atMatch[1];
                const index = this.evalExpr(atMatch[2], true);
                
                if (!Array.isArray(this.vars[listName])) {
                    this.throwError(`(ERR: ${listName} is not a list)`);
                    return;
                }
                
                const list = this.vars[listName];
                const actualIndex = index < 0 ? list.length + index : index;
                
                if (actualIndex < 0 || actualIndex >= list.length) {
                    this.throwError(`(ERR: Index ${index} out of bounds for list ${listName})`);
                    return;
                }
                
                this.vars[name] = list[actualIndex];
                console.log("Accessed list:", name, "=", this.vars[name]);
                return;
            }
        }

        // Handle LENGTH: LET X = LENGTH LST
        if (expr.startsWith("LENGTH ")) {
            const listName = expr.substring(7).trim();
            if (!Array.isArray(this.vars[listName])) {
                this.throwError(`(ERR: ${listName} is not a list)`);
                return;
            }
            this.vars[name] = this.vars[listName].length;
            console.log("Got length:", name, "=", this.vars[name]);
            return;
        }

        // Handle FIND: LET X = FIND 5 IN LST
        if (expr.includes(" IN ")) {
            const findMatch = expr.match(/FIND\s+(.+)\s+IN\s+(\w+)/);
            if (findMatch) {
                const value = this.evalExpr(findMatch[1], true);
                const listName = findMatch[2];
                
                if (!Array.isArray(this.vars[listName])) {
                    this.throwError(`(ERR: ${listName} is not a list)`);
                    return;
                }
                
                this.vars[name] = this.vars[listName].indexOf(value);
                console.log("Found index:", name, "=", this.vars[name]);
                return;
            }
            
            // Handle IN check: LET X = 5 IN LST
            const inMatch = expr.match(/(.+)\s+IN\s+(\w+)/);
            if (inMatch) {
                const value = this.evalExpr(inMatch[1], true);
                const listName = inMatch[2];
                
                if (!Array.isArray(this.vars[listName])) {
                    this.throwError(`(ERR: ${listName} is not a list)`);
                    return;
                }
                
                this.vars[name] = this.vars[listName].includes(value);
                console.log("Checked IN:", name, "=", this.vars[name]);
                return;
            }
        }*/

        if (expr.startsWith("CALL ")) {
            let out = await this.handleCall(expr);
            //console.log(out);
            this.vars[name] = out;
        }
        else if (expr.startsWith("EXEC ")) {
            console.log("EXECCC!! var name: "+name);
            let res = await this.handleExec(expr);
            console.log("RES: "+res);
            this.vars[name] = res;
        }
        else if (expr.startsWith("INPUT ")) {
            let userInput = await this.handleInput(expr);
            //console.log(out);
            this.vars[name] = userInput;
        }
        else {
            this.vars[name] = this.evalExpr(expr, true);
        }
        
        console.log("SET VAR " + name + " = " + this.vars[name]);
    }

    // ----- PRINT / EXEC -----
    async handleExec(line) {
        const cmd = line.substring(5).trim();

        // still doesnt handle quotes !!!
        let tmpExpr = ""
        let evaluatedCmd = "";
        let addToExpr = false;
        for(let i = 0; i<cmd.length;i++){
            if(cmd[i] == ")"){
                addToExpr = false;
                evaluatedCmd += this.evalExpr(tmpExpr);
            }
            if(addToExpr){
                tmpExpr += cmd[i];
            } else {
                if(cmd[i] != ")" && cmd[i] != "(") evaluatedCmd += cmd[i];
            }
            if(cmd[i] == "("){
                addToExpr = true;
            }
        }
        console.log("cmd after eval: "+evaluatedCmd);
        //this.throwError("cmd after eval: "+evaluatedCmd);
        //if (!this.execHandler) return "(ERR: EXEC not supported)";
        let res = await commandManager.executeCommand(evaluatedCmd);
        res = res[0].toString();
        console.log("exec res: "+res);
        res = res.replaceAll("\"","\\\"");

        // added: use here also evalExpr to get correct type of command result, for example "randint 1 10" should be an int, so raw=true flag is used to get raw type like for variables
        // but first make it a string like if defined as LET str = "<output>", the rest is handled by evalExpr(), it automatically detectes the type
        //res = "\""+res+"\"";
        //res = this.evalExpr(res,true);
        if(!isNaN(res)){ return Number(res) };


        return res;
    }

    /*
    // old evalExpr, cant handle strings!
    evalExpr(expr, raw = false) {
        // Replace variables with their values
        expr = expr.replace(/\b[A-Za-z_][A-Za-z0-9_]*\b/g, (id) => {
            if (this.vars[id] !== undefined) {
                let val = this.vars[id];
                // If it's a string, wrap in quotes for eval
                if (typeof val === "string") return "${val}";
                return val;
            }
            return id; // leave unknown identifiers untouched
        });

        if (raw) {
            // If raw is true, try to evaluate as a literal value first
            let trimmed = expr.trim();

            // 1. If it's a quoted string, return without quotes
            if ((trimmed.startsWith('"') && trimmed.endsWith('"')) ||
                (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
                return trimmed.slice(1, -1);
            }

            // 2. Try to parse as number
            if (!isNaN(trimmed)) {
                // Integer or float
                return trimmed.includes('.') ? parseFloat(trimmed) : parseInt(trimmed, 10);
            }

            // 3. Otherwise evaluate as expression
            try {
                return eval(expr);
            } catch {
                return null; // if evaluation fails
            }
        } else {
            // Existing logic for string output
            let out = "";
            let parts = expr.split(/(".*?"|'.*?')/g);

            parts.forEach((part) => {
                if (!part) return;

                if ((part.startsWith('"') && part.endsWith('"')) ||
                    (part.startsWith("'") && part.endsWith("'"))) {
                    out += part.slice(1, -1);
                } else {
                    try {
                        out += eval(expr);
                    } catch {
                        out += "(ERR)";
                    }
                }
            });

            console.log(parts);
            console.log("EXPR:", expr);
            return out;
        }
    }
    */

    // LIST FUNCTIONS:
    handleAppend(line){
        // APPEND 5 TO LST
        // APPEND 1, 2, 3 TO LST
        const match = line.match(/APPEND\s+(.+)\s+TO\s+(\w+)/);
        if (!match) {
            this.throwError("(ERR: Invalid APPEND syntax. Use: APPEND value(s) TO list)");
            return;
        }
        
        const valuesExpr = match[1];
        const listName = match[2];
        
        if (!Array.isArray(this.vars[listName])) {
            this.throwError(`(ERR: ${listName} is not a list)`);
            return;
        }
        
        // Split by comma and evaluate each value
        const values = valuesExpr.split(",").map(v => this.evalExpr(v.trim(), true));
        this.vars[listName].push(...values);
        
        console.log("Appended to list:", listName, "now:", this.vars[listName]);
    }


    handleRemove(line) {
        // REMOVE 5 FROM LST (remove first occurrence by value)
        // REMOVE INDEX 2 FROM LST (remove by index)
        // REMOVE ALL 5 FROM LST (remove all occurrences)
        
        if (line.includes(" INDEX ")) {
            const match = line.match(/REMOVE\s+INDEX\s+(.+)\s+FROM\s+(\w+)/);
            if (!match) {
                this.throwError("(ERR: Invalid REMOVE INDEX syntax)");
                return;
            }
            
            let index = this.evalExpr(match[1], true);
            const listName = match[2];

            index = parseInt(index);

            if (isNaN(index)) {
                this.throwError("(ERR: Index must be a number)");
                return;
            }
            
            if (!Array.isArray(this.vars[listName])) {
                this.throwError(`(ERR: ${listName} is not a list)`);
                return;
            }
            
            const list = this.vars[listName];
            if (index < 0 || index >= list.length) {
                this.throwError(`(ERR: Index ${index} out of bounds)`);
                return;
            }
            
            list.splice(index, 1);
            console.log("Removed index", index, "from", listName);
            
        } else if (line.includes(" ALL ")) {
            const match = line.match(/REMOVE\s+ALL\s+(.+)\s+FROM\s+(\w+)/);
            if (!match) {
                this.throwError("(ERR: Invalid REMOVE ALL syntax)");
                return;
            }
            
            const value = this.evalExpr(match[1], true);
            const listName = match[2];
            
            if (!Array.isArray(this.vars[listName])) {
                this.throwError(`(ERR: ${listName} is not a list)`);
                return;
            }
            
            this.vars[listName] = this.vars[listName].filter(item => item !== value);
            console.log("Removed all", value, "from", listName);
            
        } else {
            const match = line.match(/REMOVE\s+(.+)\s+FROM\s+(\w+)/);
            if (!match) {
                this.throwError("(ERR: Invalid REMOVE syntax)");
                return;
            }
            
            const value = this.evalExpr(match[1], true);
            const listName = match[2];
            
            if (!Array.isArray(this.vars[listName])) {
                this.throwError(`(ERR: ${listName} is not a list)`);
                return;
            }
            
            const index = this.vars[listName].indexOf(value);
            if (index !== -1) {
                this.vars[listName].splice(index, 1);
                console.log("Removed first occurrence of", value, "from", listName);
            }
        }
    }

    handleSetAt(line) {
        // SET LST AT 2 TO 99
        const match = line.match(/SET\s+(\w+)\s+AT\s+(.+)\s+TO\s+(.+)/);
        if (!match) {
            this.throwError("(ERR: Invalid SET AT syntax. Use: SET list AT index TO value)");
            return;
        }
        
        const listName = match[1];
        const index = this.evalExpr(match[2], true);
        const value = this.evalExpr(match[3], true);
        
        if (!Array.isArray(this.vars[listName])) {
            this.throwError(`(ERR: ${listName} is not a list)`);
            return;
        }
        
        const list = this.vars[listName];
        const actualIndex = index < 0 ? list.length + index : index;
        
        if (actualIndex < 0 || actualIndex >= list.length) {
            this.throwError(`(ERR: Index ${index} out of bounds)`);
            return;
        }
        
        list[actualIndex] = value;
        console.log("Set", listName, "at", index, "to", value);
    }

    handleClear(line) {
        // CLEAR LST
        const match = line.match(/CLEAR\s+(\w+)/);
        if (!match) {
            this.throwError("(ERR: Invalid CLEAR syntax. Use: CLEAR list)");
            return;
        }
        
        const listName = match[1];
        
        if (!Array.isArray(this.vars[listName])) {
            this.throwError(`(ERR: ${listName} is not a list)`);
            return;
        }
        
        this.vars[listName] = [];
        console.log("Cleared list:", listName);
    }




    // need to handle lists in expressions. dont treat them like variables, for example for PRINT: PRINT LST should print the list like this (1,2,3) ...

    // ----- EXPRESSION EVALUATOR -----
    /*evalExpr(expr, raw = false) {
        if (raw) {
            // RAW MODE: For LET assignments - return the actual value
            return this._evaluateExpression(expr);
        } else {
            // NORMAL MODE: For PRINT statements - return string output
            return this._evaluateForOutput(expr);
        }
    }

    // Helper function to evaluate expressions and return actual values
    _evaluateExpression(expr) {
        expr = expr.trim();
        
        // Handle string literals
        if ((expr.startsWith('"') && expr.endsWith('"')) || 
            (expr.startsWith("'") && expr.endsWith("'"))) {
            return expr.slice(1, -1);
        }
        
        // Handle numbers
        if (!isNaN(expr)) {
            return expr.includes('.') ? parseFloat(expr) : parseInt(expr, 10);
        }
        
        // Handle booleans
        if (expr === 'true') return true;
        if (expr === 'false') return false;
        
        // NEW: Handle direct variable references (including lists)
        // Check if expr is just a simple variable name
        if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(expr)) {
            if (this.vars[expr] !== undefined) {
                return this.vars[expr];  // Return the actual value (including arrays)
            }
        }
        
        // Expand list operations BEFORE complex expression evaluation
        expr = this._expandListOperations(expr);

        expr = this._expandGraphicsOperations(expr);

        expr = this._expandOtherOperations(expr);
        
        // Handle complex expressions with variables and operators
        return this._evaluateComplexExpression(expr);
    }

    // maybe also add function calls to expr like variables

    _expandListOperations(expr) {
        let expanded = expr;

        // 1. Handle FIND first (before plain IN)
        // FIND <value> IN <listname> → returns index or -1
        expanded = expanded.replace(/FIND\s+(.+?)\s+IN\s+(\w+)/g, (match, valueExpr, listName) => {
            if (!Array.isArray(this.vars[listName])) {
                this.throwError(`(ERR: ${listName} is not a list)`);
                return '-1';
            }
            
            // Recursively evaluate the value expression
            const value = this._evaluateExpression(valueExpr.trim());
            return this.vars[listName].indexOf(value).toString();
        });
        
        // 2. Handle LENGTH
        // LENGTH <listname> → returns number
        expanded = expanded.replace(/LENGTH\s+(\w+)/g, (match, listName) => {
            if (!Array.isArray(this.vars[listName])) {
                this.throwError(`(ERR: ${listName} is not a list)`);
                return '0';
            }
            return this.vars[listName].length.toString();
        });
        
        // 3. Handle AT access
        // <listname> AT <index> → returns value
        // Note: This regex matches simple indices. For complex expressions like "I+1", 
        // you'd need more sophisticated parsing
        expanded = expanded.replace(/(\w+)\s+AT\s+([\w\d\-+\*\/\(\)]+)/g, (match, listName, indexExpr) => {
            if (!Array.isArray(this.vars[listName])) {
                this.throwError(`(ERR: ${listName} is not a list)`);
                return 'null';
            }
            
            // Recursively evaluate the index expression
            const index = this._evaluateExpression(indexExpr.trim());
            
            if (typeof index !== 'number') {
                this.throwError(`(ERR: Index must be a number)`);
                return 'null';
            }
            
            const list = this.vars[listName];
            const actualIndex = index < 0 ? list.length + index : index;
            
            if (actualIndex < 0 || actualIndex >= list.length) {
                this.throwError(`(ERR: Index ${index} out of bounds for list ${listName})`);
                return 'null';
            }
            
            const value = list[actualIndex];
            
            // Return value in a format safe for eval
            if (typeof value === 'string') {
                // Escape quotes in the string
                return `"${value.replace(/"/g, '\\"')}"`;
            } else if (typeof value === 'boolean') {
                return value.toString();
            } else if (value === null || value === undefined) {
                return 'null';
            }
            return value.toString();
        });
        
        // 4. Handle IN checks (after FIND to avoid conflicts)
        // <value> IN <listname> → returns boolean
        // This is tricky because we need to match the value part carefully
        // We'll use a simpler regex and handle it carefully
        expanded = expanded.replace(/(.+?)\s+IN\s+(\w+)/g, (match, valueExpr, listName) => {
            // Skip if this was part of a FIND expression (already handled)
            if (valueExpr.trim().startsWith('FIND')) {
                return match; // Return unchanged
            }
            
            if (!Array.isArray(this.vars[listName])) {
                this.throwError(`(ERR: ${listName} is not a list)`);
                return 'false';
            }
            
            const value = this._evaluateExpression(valueExpr.trim());
            return this.vars[listName].includes(value).toString();
        });
        
        return expanded;
    }

    _expandGraphicsOperations(expr){
        let expanded = expr;

        if (!Modules.gfx) {
            expanded = expanded.replace(/GUSED/g, () => {
                return "false";
            });
            this.throwError("(ERR: Graphics module not loaded)");
            return expanded;
        }

        // maybe do the dame for function names if implementing,
        // functions to be called like: LET RES = ADD 1,2,3,A,B,...
        // GUSED
        expanded = expanded.replace(/GUSED/g, () => {
            
            return Modules.gfx.isUsed().toString();
        });

        return expanded
    }

    _expandOtherOperations(expr){
        let expanded = expr;
        
        // Handle ISDOWN "key" or ISDOWN key (if it's a variable)
        expanded = expanded.replace(/ISDOWN\s+("(?:[^"]*)"|[A-Za-z_][A-Za-z0-9_]*)/g,
            (match, keyExpr) => {
                const key = this._evaluateExpression(keyExpr);
                const isPressed = this.iskeyDown(key);
                return isPressed.toString();
            }
        );
        
        return expanded;
    }*/

    evalExpr(expr, raw = false) {
        if (raw) {
            return this._evaluateExpression(expr);
        } else {
            return this._evaluateForOutput(expr);
        }
    }

    _evaluateExpression(expr) {
        expr = expr.trim();
        
        // Handle string literals FIRST
        if ((expr.startsWith('"') && expr.endsWith('"')) || 
            (expr.startsWith("'") && expr.endsWith("'"))) {
            return expr.slice(1, -1);
        }
        
        // Handle numbers
        if (!isNaN(expr)) {
            return expr.includes('.') ? parseFloat(expr) : parseInt(expr, 10);
        }
        
        // Handle booleans
        if (expr === 'true') return true;
        if (expr === 'false') return false;
        
        // Handle direct variable references
        if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(expr)) {
            if (this.vars[expr] !== undefined) {
                return this.vars[expr];
            }
            // If it's not a variable but might be a special function like GUSED, continue to expansion
        }
        
        // Expand special operations and functions
        const expandedExpr = this._expandOperations(expr);
        
        // If expansion changed the expression, evaluate the result
        if (expandedExpr !== expr) {
            return this._evaluateComplexExpression(expandedExpr);
        }
        
        // Otherwise, evaluate as complex expression
        return this._evaluateComplexExpression(expr);
    }

    _evaluateForOutput(expr) {
        // For PRINT statements, we need to handle string concatenation properly
        const result = this._evaluateExpression(expr);
        return String(result);
    }

    _expandOperations(expr) {
        // First expand special functions that should NEVER be inside strings
        let expanded = this._expandGraphicsOperations(expr);
        expanded = this._expandListOperations(expanded);
        expanded = this._expandOtherOperations(expanded);
        
        return expanded;
    }

    _expandGraphicsOperations(expr) {
        let expanded = expr;

        if (!Modules.gfx) {
            // Only replace GUSED when it's not inside quotes
            expanded = expanded.replace(/GUSED(?=\s|$|\))/g, (match, offset) => {
                if (this._isInsideQuotes(expanded, offset)) return match;
                return "false";
            });
            return expanded;
        }

        expanded = expanded.replace(/GUSED(?=\s|$|\))/g, (match, offset) => {
            if (this._isInsideQuotes(expanded, offset)) return match;
            return Modules.gfx.isUsed().toString();
        });

        return expanded;
    }

    _expandListOperations(expr) {
        let expanded = expr;


        // Handle LIST creation - only when not in quotes
        expanded = expanded.replace(/LIST\s*(.*)$/g, (match, valuesStr, offset) => {
            if (this._isInsideQuotes(expanded, offset)) return match;
            
            if (valuesStr.trim() === "") {
                // Empty list
                return "[]";
            } else {
                // List with values: LIST 1, 2, 3
                // We need to evaluate each value and create array literal
                const values = valuesStr.split(",").map(v => {
                    const evaluated = this._evaluateExpression(v.trim());
                    // Properly format the value for the array literal
                    if (typeof evaluated === 'string') {
                        return `"${evaluated.replace(/"/g, '\\"')}"`;
                    } else if (typeof evaluated === 'boolean') {
                        return evaluated.toString();
                    } else if (evaluated === null || evaluated === undefined) {
                        return 'null';
                    }
                    return evaluated.toString();
                });
                return `[${values.join(', ')}]`;
            }
        });


        // Handle FIND - only when not in quotes
        expanded = expanded.replace(/FIND\s+(.+?)\s+IN\s+(\w+)/g, (match, valueExpr, listName, offset) => {
            if (this._isInsideQuotes(expanded, offset)) return match;
            
            if (!Array.isArray(this.vars[listName])) {
                this.throwError(`(ERR: ${listName} is not a list)`);
                return '-1';
            }
            
            const value = this._evaluateExpression(valueExpr.trim());
            return this.vars[listName].indexOf(value).toString();
        });
        
        // Handle LENGTH
        expanded = expanded.replace(/LENGTH\s+(\w+)/g, (match, listName, offset) => {
            if (this._isInsideQuotes(expanded, offset)) return match;
            
            if (!Array.isArray(this.vars[listName])) {
                this.throwError(`(ERR: ${listName} is not a list)`);
                return '0';
            }
            return this.vars[listName].length.toString();
        });
        
        // Handle AT access
        expanded = expanded.replace(/(\w+)\s+AT\s+([\w\d\-+\*\/\(\)]+)/g, (match, listName, indexExpr, offset) => {
            if (this._isInsideQuotes(expanded, offset)) return match;
            
            if (!Array.isArray(this.vars[listName])) {
                this.throwError(`(ERR: ${listName} is not a list)`);
                return 'null';
            }
            
            let index = this._evaluateExpression(indexExpr.trim());

            index = Number(index);

            if (Number.isNaN(index)) {
                this.throwError(`(ERR: Index must be a number: got "${index}")`);
                return 'null';
            }

            //this.throwError(expanded+", "+index + ", type: "+ typeof index);
            if (typeof index !== 'number') {
                //this.throwError(expanded+", "+index + ", type: "+ typeof index);
                this.throwError(`(ERR: Index must be a number)`);
                return 'null';
            }
            
            const list = this.vars[listName];
            const actualIndex = index < 0 ? list.length + index : index;
            
            if (actualIndex < 0 || actualIndex >= list.length) {
                this.throwError(`(ERR: Index ${index} out of bounds for list ${listName})`);
                return 'null';
            }
            
            const value = list[actualIndex];
            
            // Return value in a format safe for eval
            if (typeof value === 'string') {
                return `"${value.replace(/"/g, '\\"')}"`;
            } else if (typeof value === 'boolean') {
                return value.toString();
            } else if (value === null || value === undefined) {
                return 'null';
            }
            return value.toString();
        });
        
        // Handle IN checks
        expanded = expanded.replace(/(.+?)\s+IN\s+(\w+)/g, (match, valueExpr, listName, offset) => {
            if (this._isInsideQuotes(expanded, offset)) return match;
            
            if (valueExpr.trim().startsWith('FIND')) {
                return match;
            }
            
            if (!Array.isArray(this.vars[listName])) {
                this.throwError(`(ERR: ${listName} is not a list)`);
                return 'false';
            }
            
            const value = this._evaluateExpression(valueExpr.trim());
            return this.vars[listName].includes(value).toString();
        });
        
        return expanded;
    }

    _expandOtherOperations(expr) {
        let expanded = expr;
        
        // Handle ISDOWN
        expanded = expanded.replace(/ISDOWN\s+("(?:[^"]*)"|[A-Za-z_][A-Za-z0-9_]*)/g,
            (match, keyExpr, offset) => {
                // Check if we're inside quotes using the match offset
                if (this._isInsideQuotes(expanded, offset)) {
                    return match; // Return unchanged if inside quotes
                }
                
                // Evaluate the key expression (could be a string literal or variable)
                const key = this._evaluateExpression(keyExpr);
                const isPressed = this.iskeyDown(key);
                return isPressed.toString();
            }
        );
        
        return expanded;
    }

    // Improved helper to check if position is inside quotes
    /*_isInsideQuotes(expr, position) {
        if (position === undefined) return false;
        
        const before = expr.substring(0, position);
        const singleQuotesBefore = (before.match(/'/g) || []).length;
        const doubleQuotesBefore = (before.match(/"/g) || []).length;
        
        // If odd number of quotes before, we're inside quotes
        return (singleQuotesBefore % 2 === 1) || (doubleQuotesBefore % 2 === 1);
    }*/

    _isInsideQuotes(expr, position) {
        if (position === undefined) return false;
        
        const before = expr.substring(0, position);
        
        // Count unescaped quotes before this position
        let singleQuotesBefore = 0;
        let doubleQuotesBefore = 0;
        let escaped = false;
        
        for (let i = 0; i < before.length; i++) {
            const char = before[i];
            
            if (escaped) {
                escaped = false;
                continue;
            }
            
            if (char === '\\') {
                escaped = true;
            } else if (char === "'") {
                singleQuotesBefore++;
            } else if (char === '"') {
                doubleQuotesBefore++;
            }
        }
        
        // If odd number of quotes before, we're inside quotes
        return (singleQuotesBefore % 2 === 1) || (doubleQuotesBefore % 2 === 1);
    }

    // Helper function to evaluate complex expressions
    _evaluateComplexExpression(expr) {
        // First, replace all string literals with placeholders to protect them
        const stringLiterals = [];
        let exprWithoutStrings = expr.replace(/(".*?"|'.*?')/g, (match) => {
            const placeholder = `__STRING_${stringLiterals.length}__`;
            stringLiterals.push(match.slice(1, -1)); // Remove quotes
            return placeholder;
        });
        
        // Replace variables with their values
        exprWithoutStrings = exprWithoutStrings.replace(/\b[A-Za-z_][A-Za-z0-9_]*\b/g, (id) => {
            if (this.vars[id] !== undefined) {
                const val = this.vars[id];
                if (typeof val === 'string') {
                    const placeholder = `__STRING_${stringLiterals.length}__`;
                    stringLiterals.push(val);
                    return placeholder;
                } else if (typeof val === 'boolean') {
                    return val.toString();
                } else if (Array.isArray(val)) {
                    // NEW: Handle arrays
                    // Convert array to JSON representation
                    const jsonStr = JSON.stringify(val);
                    return jsonStr;
                }
                return val;
            }
            return id;
        });
        
        // Restore string literals
        let finalExpr = exprWithoutStrings;
        stringLiterals.forEach((str, index) => {
            finalExpr = finalExpr.replace(`__STRING_${index}__`, `"${str}"`);
        });
        
        try {
            // Use Function constructor instead of eval for better security
            return new Function(`return ${finalExpr}`)();
        } catch (error) {
            console.error("Error evaluating expression:", finalExpr, error);
            return `(ERR: ${error.message})`;
        }
    }

    // Helper function for PRINT statements - evaluate and convert to string
    _evaluateForOutput(expr) {
        // Split into parts by string literals
        const parts = expr.split(/(".*?"|'.*?')/g);
        let output = '';
        
        for (const part of parts) {
            if (!part) continue;
            
            if ((part.startsWith('"') && part.endsWith('"')) || 
                (part.startsWith("'") && part.endsWith("'"))) {
                // String literal - remove quotes and add to output
                output += part.slice(1, -1);
            } else if (part.trim() !== '') {
                // Non-string part - evaluate it
                const evaluated = this._evaluateExpression(part);
                output += String(evaluated);
            }
        }
        
        return output;
    }

    // ----- IF THEN END -----
    /*handleIf(lines, start) {
        const conditionLine = lines[start];
        const condPart = conditionLine.replace(/^IF\s+/, "").replace(/\s+THEN$/, "");
        
        // Evaluate the condition as a boolean expression
        const condValue = this._evaluateExpression(condPart);
        
        // Read block
        let block = [];
        let i = start + 1;
        while (i < lines.length && lines[i] !== "END") {
            block.push(lines[i]);
            i++;
        }
        
        console.log("Cond val:", condValue, "; TYPE:", typeof condValue);
        
        // Proper boolean check
        if (condValue === true) {
            const [out] = this.executeBlock(block, 0);
            return [out, i];
        } else {
            return ["", i];
        }
    }*/

    // ----- IF THEN ELSE END -----
    async handleIf(lines, start) {
        const conditionLine = lines[start];
        const condPart = conditionLine.replace(/^IF\s+/, "").replace(/\s+THEN$/, "");
        
        // Evaluate the condition as a boolean expression
        const condValue = this._evaluateExpression(condPart);
        
        // Read blocks with proper nesting support
        let thenBlock = [];
        let elseBlock = [];
        let currentBlock = thenBlock;
        let i = start + 1;
        let foundElse = false;
        let depth = 0; // Track nested structures (IF, WHILE, ITER)
        
        while (i < lines.length) {
            const line = lines[i];
            
            // Check for nested structures
            if (line.startsWith("IF ") || line.startsWith("WHILE ") || line.startsWith("ITER ")) {
                depth++;
            }
            
            // Check for END statements
            if (line === "END") {
                if (depth > 0) {
                    // This END closes a nested structure
                    depth--;
                } else {
                    // This END closes our current IF
                    break;
                }
            }
            
            // Check for ELSE at our current level (not nested)
            if (line === "ELSE" && depth === 0) {
                foundElse = true;
                currentBlock = elseBlock;
                i++;
                continue;
            }
            
            currentBlock.push(line);
            i++;
        }
        
        console.log("Cond val:", condValue, "; TYPE:", typeof condValue);
        console.log("Found ELSE:", foundElse);
        console.log("Then block:", thenBlock);
        console.log("Else block:", elseBlock);
        
        // Proper boolean check
        if (condValue === true) {
            const [out] = await this.executeBlock(thenBlock, 0);
            console.log("reached!! "+i+" out: "+out)
            return [out, i];
        } else if (foundElse) {
            // Only execute else block if it exists AND the condition was false
            const [out] = await this.executeBlock(elseBlock, 0);
            return [out, i];
        } else {
            // If condition is false and no ELSE block, just skip to the END
            return ["", i];
        }
    }

    async handleWhile(lines, start) {
        const conditionLine = lines[start];
        const condPart = conditionLine.replace(/^WHILE\s+/, "").replace(/\s+START$/, "");
        
        // Read the while loop body with proper nesting support
        let whileBlock = [];
        let i = start + 1;
        let depth = 0; // Track nested structures
        
        while (i < lines.length) {
            const line = lines[i];
            
            // Check for nested structures (WHILE, IF, ITER)
            if (line.startsWith("WHILE ") || line.startsWith("IF ") || line.startsWith("ITER ")) {
                depth++;
            }
            
            // Check for END statements
            if (line === "END") {
                if (depth > 0) {
                    depth--;
                } else {
                    break;
                }
            }
            
            whileBlock.push(line);
            i++;
        }
        
        // Now execute the while loop
        let iterations = 0;
        const maxIterations = 100000000; // Safety limit to prevent infinite loops
        
        let last_update = performance.now();
        let update_time_ms = 32;

        console.log(whileBlock);

        while (iterations < maxIterations && !this.interruptExecution) {
            // Evaluate the condition each iteration
            const condValue = this._evaluateExpression(condPart);
            
            console.log("While condition:", condPart, "=", condValue, "TYPE:", typeof condValue);
            
            // render frame, also important for ctrl-c to work
            let cur_time = performance.now();
            if(cur_time - last_update > update_time_ms){
                last_update = cur_time;
                await new Promise(requestAnimationFrame);
            }

            // Break if condition is false
            if (condValue !== true) {
                break;
            }
            
            // Execute the loop body
            const [out, nextIndex, returnValue] = await this.executeBlock(whileBlock, 0, false, true);
            
            // Check for errors or early returns
            if (this.hasError) {
                break;
            }

            // Check for break flag after executing until break/cont in the body
            if (this.breakLoop) {
                console.log("BREAK detected in loop - breaking");
                this.breakLoop = false;
                break;
            }
            
            if (this.contLoop) {
                console.log("CONTINUE detected in loop - continuing");
                this.contLoop = false;
            }
            
            // If there was a RETURN in the loop body (in function context)
            if (returnValue !== null) {
                return [out, i, returnValue];
            }
            
            iterations++;
            
            // Safety check - prevent infinite loops
            if (iterations >= maxIterations) {
                this.throwError("(ERR: While loop iteration limit exceeded)");
                break;
            }
        }
        
        console.log("While loop completed after", iterations, "iterations");
        
        // Skip the END line
        return ["", i + 1, null];
    }

    // loop: ITER 1 TO 10 START
    /*async handleLoop(lines, start){
        const loopLine = lines[start];
        const match = loopLine.match(/^ITER\s+(.+?)\s+TO\s+(.+?)\s+WITH\s+(\w+)$/);
        
        if (!match) {
            this.throwError("(ERR: Invalid ITER syntax. Use: ITER start TO end WITH variable)");
            return start;
        }

        const iter_start = this.evalExpr(match[1], true);
        const iter_end = this.evalExpr(match[2], true);
        const iterator = match[3];

        if (typeof iter_start !== "number" || typeof iter_end !== "number") {
            this.throwError("(ERR: Issue in ITER: start or end index isn't a number)");
            return start;
        }

        console.log("ITER start:", iter_start, "end:", iter_end, "WITH:", iterator);
        
        let i = start + 1;
        let body = [];
        let depth = 0;
        
        // Read body with proper nesting support
        while (i < lines.length) {
            const line = lines[i];
            
            // Check for nested structures
            if (line.startsWith("ITER ") || line.startsWith("IF ") || line.startsWith("WHILE ")) {
                depth++;
            }
            
            // Check for END statements
            if (line === "END") {
                if (depth > 0) {
                    depth--;
                } else {
                    break;
                }
            }
            
            body.push(line);
            i++;
        }

        let last_update = performance.now();
        let update_time_ms = 32; // Reduced for better responsiveness
        
        // Save current value of iterator if it exists
        const oldIteratorValue = this.vars[iterator];
        
        // Execute every iteration
        for(let curI = iter_start; curI <= iter_end; curI++) {
            if(this.interruptExecution) {
                break;
            }
            
            // Update iterator value
            this.vars[iterator] = curI;
            console.log(`ITER ${iterator} = ${curI}`);
            
            // Execute the loop body
            const [out, nextIndex, returnValue] = await this.executeBlock(body, 0, false, true);

            // Check for break flag
            if (this.breakLoop) {
                console.log("BREAK detected in ITER loop - breaking");
                this.breakLoop = false;
                break;
            }
            
            // Check for continue flag
            if (this.contLoop) {
                console.log("CONTINUE detected in ITER loop - continuing");
                this.contLoop = false;
                continue;
            }

            // Handle return values
            if (returnValue !== null) {
                break;
            }
            
            // Throttle execution to prevent browser freezing
            let cur_time = performance.now();
            if(cur_time - last_update > update_time_ms) {
                last_update = cur_time;
                await new Promise(requestAnimationFrame);
            }
        }
        
        // Restore original iterator value if it existed
        if (oldIteratorValue !== undefined) {
            this.vars[iterator] = oldIteratorValue;
        } else {
            delete this.vars[iterator];
        }

        return i + 1; // Skip END line
    }*/

    // above: old loop func
    // new loop with STEP support:
    async handleLoop(lines, start){
        const loopLine = lines[start];
        
        // Updated regex to handle optional STEP: ITER start TO end [STEP step] WITH variable
        const match = loopLine.match(/^ITER\s+(.+?)\s+TO\s+(.+?)(?:\s+STEP\s+(.+?))?\s+WITH\s+(\w+)$/);
        
        if (!match) {
            this.throwError("(ERR: Invalid ITER syntax. Use: ITER start TO end [STEP step] WITH variable)");
            return start;
        }

        const iter_start = this.evalExpr(match[1], true);
        const iter_end = this.evalExpr(match[2], true);
        const step = match[3] ? this.evalExpr(match[3], true) : 1; // Default step is 1
        const iterator = match[4];

        // Validate all parameters are numbers
        if (typeof iter_start !== "number" || typeof iter_end !== "number" || typeof step !== "number") {
            this.throwError("(ERR: Issue in ITER: start, end, and step must be numbers)");
            return start;
        }

        // Validate step is not zero
        if (step === 0) {
            this.throwError("(ERR: STEP cannot be zero)");
            return start;
        }

        console.log("ITER start:", iter_start, "end:", iter_end, "STEP:", step, "WITH:", iterator);
        
        let i = start + 1;
        let body = [];
        let depth = 0;
        
        // Read body with proper nesting support
        while (i < lines.length) {
            const line = lines[i];
            
            // Check for nested structures
            if (line.startsWith("ITER ") || line.startsWith("IF ") || line.startsWith("WHILE ")) {
                depth++;
            }
            
            // Check for END statements
            if (line === "END") {
                if (depth > 0) {
                    depth--;
                } else {
                    break;
                }
            }
            
            body.push(line);
            i++;
        }

        let last_update = performance.now();
        let update_time_ms = 32;
        
        // Save current value of iterator if it exists
        const oldIteratorValue = this.vars[iterator];
        
        // Execute every iteration with step
        if (step > 0) {
            // Positive step: count up
            for(let curI = iter_start; curI <= iter_end; curI += step) {
                if(this.interruptExecution) {
                    break;
                }
                
                // Update iterator value
                this.vars[iterator] = curI;
                console.log(`ITER ${iterator} = ${curI}`);
                
                // Execute the loop body
                const [out, nextIndex, returnValue] = await this.executeBlock(body, 0, false, true);

                // Check for break flag
                if (this.breakLoop) {
                    console.log("BREAK detected in ITER loop - breaking");
                    this.breakLoop = false;
                    break;
                }
                
                // Check for continue flag
                if (this.contLoop) {
                    console.log("CONTINUE detected in ITER loop - continuing");
                    this.contLoop = false;
                    continue;
                }

                // Handle return values
                if (returnValue !== null) {
                    break;
                }
                
                // Throttle execution to prevent browser freezing
                let cur_time = performance.now();
                if(cur_time - last_update > update_time_ms) {
                    last_update = cur_time;
                    await new Promise(requestAnimationFrame);
                }
            }
        } else {
            // Negative step: count down
            for(let curI = iter_start; curI >= iter_end; curI += step) { // step is negative, so this counts down
                if(this.interruptExecution) {
                    break;
                }
                
                // Update iterator value
                this.vars[iterator] = curI;
                console.log(`ITER ${iterator} = ${curI}`);
                
                // Execute the loop body
                const [out, nextIndex, returnValue] = await this.executeBlock(body, 0, false, true);

                // Check for break flag
                if (this.breakLoop) {
                    console.log("BREAK detected in ITER loop - breaking");
                    this.breakLoop = false;
                    break;
                }
                
                // Check for continue flag
                if (this.contLoop) {
                    console.log("CONTINUE detected in ITER loop - continuing");
                    this.contLoop = false;
                    continue;
                }

                // Handle return values
                if (returnValue !== null) {
                    break;
                }
                
                // Throttle execution to prevent browser freezing
                let cur_time = performance.now();
                if(cur_time - last_update > update_time_ms) {
                    last_update = cur_time;
                    await new Promise(requestAnimationFrame);
                }
            }
        }
        
        // Restore original iterator value if it existed
        if (oldIteratorValue !== undefined) {
            this.vars[iterator] = oldIteratorValue;
        } else {
            delete this.vars[iterator];
        }

        return i + 1; // Skip END line
    }

    
    throwError(desc){
        this.error = true;
        this.errorDesc = desc;
    }

    // ----- FUNCTION DECL -----
    handleFunction(lines, start) {
        const header = lines[start];
        
        const match = header.match(/FUNCTION\s+(\w+)(?:\s+PARAM\s+(.+))?\s+START/);
        if (!match) {
            console.error("Invalid function declaration:", header);
            this.throwError("CRITICAL ERROR (cannot continue!): Invalid function declaration!");
            return start;
        }

        const name = match[1];
        const params = match[2] ? match[2].split(",").map(s => s.trim()) : [];

        console.log("Name: " + name, "Params: " + params);

        let i = start + 1;
        let body = [];
        let depth = 0; // Add depth tracking for nested structures

        while (i < lines.length) {
            const line = lines[i];
            
            // Check for nested structures
            if (line.startsWith("FUNCTION ") || line.startsWith("IF ") || line.startsWith("WHILE ") || line.startsWith("ITER ")) {
                depth++;
            }
            
            // Check for END statements
            if (line === "END") {
                if (depth > 0) {
                    // This END closes a nested structure
                    depth--;
                } else {
                    // This END closes our current FUNCTION
                    break;
                }
            }
            
            body.push(line);
            i++;
        }

        this.functions[name] = {
            params: params,
            body
        };

        return i + 1; // Skip the END line
    }


    // ----- CALL Add WITH A,B -----
    /*async handleCall(line) {
        const match = line.match(/CALL\s+(\w+)(?:\s+WITH\s+(.+))?/);
        if (!match) return;

        const name = match[1];
        const args = match[2] ? match[2].split(",").map(a => a.trim()) : [];
        const fn = this.functions[name];

        console.log("FUNC: NAME " + name + " ARGS " + args);

        if (!fn) return "(ERR: Function not found)"; // maybe throw error and terminate

        // Check parameter count only if function has parameters defined
        if (fn.params.length !== args.length) {
            return "(ERR: Incorrect count of arguments passed)";
        }

        // Save current scope
        const oldVars = { ...this.vars };
        
        // Create new scope with function parameters
        const functionVars = { ...oldVars };
        
        // Set parameters in function scope (only if there are parameters)
        fn.params.forEach((param, index) => {
            functionVars[param] = this.evalExpr(args[index], true);
        });

        // Switch to function scope
        this.vars = functionVars;

        let returnValue = null;

        try {
            const [output, nextIndex, funcReturnValue] = await this.executeBlock(fn.body, 0, true);
            returnValue = funcReturnValue;
            console.log("Out: " + output + " nI: " + nextIndex + " rv: " + funcReturnValue);
        } finally {
            // Always restore original scope
            this.vars = oldVars;
        }

        return returnValue;
    }*/

    splitFunctionArgs(argsStr) {
        if (!argsStr || argsStr.trim() === '') return [];
        
        const args = [];
        let currentArg = '';
        let depth = 0; // Parentheses depth counter
        let inSingleQuote = false;
        let inDoubleQuote = false;
        let escaped = false;
        
        for (let i = 0; i < argsStr.length; i++) {
            const char = argsStr[i];
            
            // Handle escape sequences
            if (escaped) {
                currentArg += char;
                escaped = false;
                continue;
            }
            
            if (char === '\\') {
                escaped = true;
                currentArg += char;
                continue;
            }
            
            // Handle quotes (only if not inside parentheses)
            if (depth === 0) {
                if (char === "'" && !inDoubleQuote) {
                    inSingleQuote = !inSingleQuote;
                    currentArg += char;
                    continue;
                }
                if (char === '"' && !inSingleQuote) {
                    inDoubleQuote = !inDoubleQuote;
                    currentArg += char;
                    continue;
                }
            }
            
            // Handle parentheses (regardless of quotes)
            if (char === '(' && !inSingleQuote && !inDoubleQuote) {
                depth++;
            } else if (char === ')' && !inSingleQuote && !inDoubleQuote) {
                depth--;
            }
            
            // Split only when at top level and not in quotes
            if (char === ',' && depth === 0 && !inSingleQuote && !inDoubleQuote) {
                args.push(currentArg.trim());
                currentArg = '';
            } else {
                currentArg += char;
            }
        }
        
        // Don't forget the last argument
        if (currentArg.trim() !== '') {
            args.push(currentArg.trim());
        }
        
        return args;
    }

    // handleCall with global var update support
    async handleCall(line) {
        const match = line.match(/CALL\s+(\w+)(?:\s+WITH\s+(.+))?/);
        if (!match) return;

        const name = match[1];
        const args = match[2] ? match[2].split(",").map(a => a.trim()) : [];
        const fn = this.functions[name];

        console.log("FUNC: NAME " + name + " ARGS " + args);

        if (!fn) return "(ERR: Function not found)";

        if (fn.params.length !== args.length) {
            return "(ERR: Incorrect count of arguments passed)";
        }

        // Save current scope and create snapshot of existing global variables
        const oldVars = { ...this.vars };
        const originalGlobalKeys = new Set(Object.keys(oldVars));
        
        // Create new scope with function parameters
        const functionVars = { ...oldVars };
        
        // Set parameters in function scope
        fn.params.forEach((param, index) => {
            functionVars[param] = this.evalExpr(args[index], true);
        });

        // Switch to function scope
        this.vars = functionVars;

        let returnValue = null;

        try {
            const [output, nextIndex, funcReturnValue] = await this.executeBlock(fn.body, 0, true);
            returnValue = funcReturnValue;
            console.log("Out: " + output + " nI: " + nextIndex + " rv: " + funcReturnValue);
        } finally {
            // Always restore original scope, but update existing global variables
            const currentFunctionVars = this.vars;
            this.vars = oldVars;
            
            // Update only variables that existed in the global scope before the function call
            for (const key of originalGlobalKeys) {
                if (currentFunctionVars[key] !== undefined && 
                    currentFunctionVars[key] !== functionVars[key]) {
                    // Variable existed globally and was modified in function scope
                    this.vars[key] = currentFunctionVars[key];
                }
            }
            
            // Note: New variables created in function scope are automatically discarded
            // since we restored the oldVars and only updated existing keys
        }

        return returnValue;
    }

    // graphics:
    handleGInit(line) {
        if (!Modules.gfx) {
            this.throwError("(ERR: Graphics module not loaded. Use: load gfx)");
            return;
        }

        // GINIT or GINIT 800, 600
        const match = line.match(/GINIT(?:\s+(.+))?/);
        if (!match) {
            this.throwError("(ERR: Invalid GINIT syntax. Use: GINIT [width, height])");
            return;
        }

        let width = 800, height = 600;
        if (match[1]) {
            const args = this.parseCommaArgs(match[1]);
            if (args.length === 2) {
                width = parseInt(this.evalExpr(args[0], true));
                height = parseInt(this.evalExpr(args[1], true));
            } else if (args.length > 0) {
                this.throwError("(ERR: GINIT requires 0 or 2 arguments)");
                return;
            }
        }

        const result = Modules.gfx.init(width, height);
        if (!result.success) {
            this.throwError(`(ERR: ${result.error})`);
        }
    }

    handleGClose() {
        if (!Modules.gfx) {
            this.throwError("(ERR: Graphics module not loaded)");
            return;
        }

        const result = Modules.gfx.close();
        if (!result.success) {
            this.throwError(`(ERR: ${result.error})`);
        }
    }

    handleGClear(line) {
        if (!Modules.gfx) {
            this.throwError("(ERR: Graphics module not loaded)");
            return;
        }

        // GCLEAR or GCLEAR "#ff0000"
        const match = line.match(/GCLEAR(?:\s+(.+))?/);
        let color = '#000000';
        
        if (match && match[1]) {
            const args = this.parseCommaArgs(match[1]);
            if (args.length > 1) {
                this.throwError("(ERR: GCLEAR takes 0 or 1 arguments)");
                return;
            }
            color = this.evalExpr(args[0], true);
        }

        try {
            Modules.gfx.clear(color);
        } catch (e) {
            this.throwError(`(ERR: ${e.message})`);
        }
    }

    handleGPixel(line) {
        if (!Modules.gfx) {
            this.throwError("(ERR: Graphics module not loaded)");
            return;
        }

        // GPIXEL x, y or GPIXEL x, y, color
        const match = line.match(/GPIXEL\s+(.+)/);
        if (!match) {
            this.throwError("(ERR: Invalid GPIXEL syntax. Use: GPIXEL x, y [, color])");
            return;
        }

        const args = this.parseCommaArgs(match[1]);
        if (args.length < 2 || args.length > 3) {
            this.throwError("(ERR: GPIXEL requires 2 or 3 arguments)");
            return;
        }

        const x = this.evalExpr(args[0], true);
        const y = this.evalExpr(args[1], true);
        const color = args[2] ? this.evalExpr(args[2], true) : '#00ff00';

        try {
            Modules.gfx.drawPixel(x, y, color);
        } catch (e) {
            this.throwError(`(ERR: ${e.message})`);
        }
    }

    handleGLine(line) {
        if (!Modules.gfx) {
            this.throwError("(ERR: Graphics module not loaded)");
            return;
        }

        // GLINE x1, y1, x2, y2 [, color, width]
        const match = line.match(/GLINE\s+(.+)/);
        if (!match) {
            this.throwError("(ERR: Invalid GLINE syntax. Use: GLINE x1, y1, x2, y2 [, color, width])");
            return;
        }

        const args = this.parseCommaArgs(match[1]);
        if (args.length < 4 || args.length > 6) {
            this.throwError("(ERR: GLINE requires 4 to 6 arguments)");
            return;
        }

        const x1 = this.evalExpr(args[0], true);
        const y1 = this.evalExpr(args[1], true);
        const x2 = this.evalExpr(args[2], true);
        const y2 = this.evalExpr(args[3], true);
        const color = args[4] ? this.evalExpr(args[4], true) : '#00ff00';
        const width = args[5] ? this.evalExpr(args[5], true) : 1;

        try {
            Modules.gfx.drawLine(x1, y1, x2, y2, color, width);
        } catch (e) {
            this.throwError(`(ERR: ${e.message})`);
        }
    }

    handleGRect(line) {
        if (!Modules.gfx) {
            this.throwError("(ERR: Graphics module not loaded)");
            return;
        }

        // GRECT x, y, w, h [, color, width]
        const match = line.match(/GRECT\s+(.+)/);
        if (!match) {
            this.throwError("(ERR: Invalid GRECT syntax. Use: GRECT x, y, w, h [, color, width])");
            return;
        }

        const args = this.parseCommaArgs(match[1]);
        if (args.length < 4 || args.length > 6) {
            this.throwError("(ERR: GRECT requires 4 to 6 arguments)");
            return;
        }

        const x = this.evalExpr(args[0], true);
        const y = this.evalExpr(args[1], true);
        const w = this.evalExpr(args[2], true);
        const h = this.evalExpr(args[3], true);
        const color = args[4] ? this.evalExpr(args[4], true) : '#00ff00';
        const lineWidth = args[5] ? this.evalExpr(args[5], true) : 1;

        try {
            Modules.gfx.drawRect(x, y, w, h, color, lineWidth);
        } catch (e) {
            this.throwError(`(ERR: ${e.message})`);
        }
    }

    handleGFRect(line) {
        if (!Modules.gfx) {
            this.throwError("(ERR: Graphics module not loaded)");
            return;
        }

        // GFRECT x, y, w, h [, color]
        const match = line.match(/GFRECT\s+(.+)/);
        if (!match) {
            this.throwError("(ERR: Invalid GFRECT syntax. Use: GFRECT x, y, w, h [, color])");
            return;
        }

        const args = this.parseCommaArgs(match[1]);
        if (args.length < 4 || args.length > 5) {
            this.throwError("(ERR: GFRECT requires 4 or 5 arguments)");
            return;
        }

        const x = this.evalExpr(args[0], true);
        const y = this.evalExpr(args[1], true);
        const w = this.evalExpr(args[2], true);
        const h = this.evalExpr(args[3], true);
        const color = args[4] ? this.evalExpr(args[4], true) : '#00ff00';

        try {
            Modules.gfx.fillRect(x, y, w, h, color);
        } catch (e) {
            this.throwError(`(ERR: ${e.message})`);
        }
    }

    handleGCircle(line) {
        if (!Modules.gfx) {
            this.throwError("(ERR: Graphics module not loaded)");
            return;
        }

        // GCIRCLE x, y, radius [, color, width]
        const match = line.match(/GCIRCLE\s+(.+)/);
        if (!match) {
            this.throwError("(ERR: Invalid GCIRCLE syntax. Use: GCIRCLE x, y, radius [, color, width])");
            return;
        }

        const args = this.parseCommaArgs(match[1]);
        if (args.length < 3 || args.length > 5) {
            this.throwError("(ERR: GCIRCLE requires 3 to 5 arguments)");
            return;
        }

        const x = this.evalExpr(args[0], true);
        const y = this.evalExpr(args[1], true);
        const radius = this.evalExpr(args[2], true);
        const color = args[3] ? this.evalExpr(args[3], true) : '#00ff00';
        const width = args[4] ? this.evalExpr(args[4], true) : 1;

        try {
            Modules.gfx.drawCircle(x, y, radius, color, width);
        } catch (e) {
            this.throwError(`(ERR: ${e.message})`);
        }
    }

    handleGFCircle(line) {
        if (!Modules.gfx) {
            this.throwError("(ERR: Graphics module not loaded)");
            return;
        }

        // GFCIRCLE x, y, radius [, color]
        const match = line.match(/GFCIRCLE\s+(.+)/);
        if (!match) {
            this.throwError("(ERR: Invalid GFCIRCLE syntax. Use: GFCIRCLE x, y, radius [, color])");
            return;
        }

        const args = this.parseCommaArgs(match[1]);
        if (args.length < 3 || args.length > 4) {
            this.throwError("(ERR: GFCIRCLE requires 3 or 4 arguments)");
            return;
        }

        const x = this.evalExpr(args[0], true);
        const y = this.evalExpr(args[1], true);
        const radius = this.evalExpr(args[2], true);
        const color = args[3] ? this.evalExpr(args[3], true) : '#00ff00';

        try {
            Modules.gfx.fillCircle(x, y, radius, color);
        } catch (e) {
            this.throwError(`(ERR: ${e.message})`);
        }
    }

    handleGText(line) {
        if (!Modules.gfx) {
            this.throwError("(ERR: Graphics module not loaded)");
            return;
        }

        // GTEXT x, y, text [, color, size]
        const match = line.match(/GTEXT\s+(.+)/);
        if (!match) {
            this.throwError("(ERR: Invalid GTEXT syntax. Use: GTEXT x, y, text [, color, size])");
            return;
        }

        const args = this.parseCommaArgs(match[1]);
        if (args.length < 3 || args.length > 5) {
            this.throwError("(ERR: GTEXT requires 3 to 5 arguments)");
            return;
        }

        const x = this.evalExpr(args[0], true);
        const y = this.evalExpr(args[1], true);
        const text = this.evalExpr(args[2], true);
        const color = args[3] ? this.evalExpr(args[3], true) : '#00ff00';
        const size = args[4] ? this.evalExpr(args[4], true) : 16;

        try {
            Modules.gfx.drawText(x, y, text, color, size);
        } catch (e) {
            this.throwError(`(ERR: ${e.message})`);
        }
    }

    // maybe make other functions also use parseCommaArgs like lists, function params, calls
    // Helper function to parse comma-separated arguments
    parseCommaArgs(argString) {
        const args = [];
        let current = '';
        let inQuotes = false;
        let quoteChar = null;
        
        for (let i = 0; i < argString.length; i++) {
            const char = argString[i];
            
            if ((char === '"' || char === "'") && !inQuotes) {
                inQuotes = true;
                quoteChar = char;
                current += char;
            } else if (char === quoteChar && inQuotes) {
                inQuotes = false;
                quoteChar = null;
                current += char;
            } else if (char === ',' && !inQuotes) {
                args.push(current.trim());
                current = '';
            } else {
                current += char;
            }
        }
        
        if (current.trim()) {
            args.push(current.trim());
        }
        
        return args;
    }
}

// basic language syntax
// to add:
//  for loops
//  comments
//  review security of eval+command exection
//  (if/)else
//  error handling
//  debugging
//  are all related functions async?? very important!!!
//  !!! maybe count EXEC or other defined functions also as "expr", so that RETURN EXEC ls /, works without defining variable for it first 
let code = `
LET A = 10
LET B = 20

LET C = A + B
LET D = "test"
LET E = "test"

PRINT A + B
PRINT C
PRINT D

FUNCTION Add PARAM A,B START
    PRINT "Function Add called with: A->" A ", B->" B ";"
    RETURN A + B
END

FUNCTION Sub PARAM A,B START
    PRINT "Function Sub called with: A->" A ", B->" B ";"

    RETURN A - B
END

FUNCTION Test PARAM A,B START
    LET RET = CALL Add WITH 1,1
    RETURN RET
END

LET X = CALL Add WITH 5,A
PRINT "Add res: " X

LET X = CALL Sub WITH 5,B
PRINT "Sub res: " X


LET TESTVAL = CALL Test WITH 5,B
IF C == 30 THEN
PRINT "TESTVAL:" TESTVAL

LET Z = CALL shit WITH 1,1

IF C == 30 THEN
    PRINT "A is smaller, Value of A: " A "; Value of B: " B "; Val of string D: " D
ELSE
    PRINT "WHAT??!?!"
END

IF D == "test" THEN
    PRINT "D equals test!!"
END


LET X = 15
IF X > 10 THEN
    PRINT "X is greater than 10"
    IF X > 20 THEN
        PRINT "X is also greater than 20"
    ELSE
        PRINT "But X is not greater than 20"
    END
ELSE
    PRINT "X is 10 or less"
END

LET RES = EXEC ls /
PRINT "RES: " RES

ITER 1 TO 10 WITH I
    PRINT "loop: " I
END

LET I = 0
WHILE I < 1000 START
	PRINT "while: " I
    LET I = I+1
END
`;

// list style based on my list style, improved by claude:
`
# Create lists
LET LST = LIST                    # Empty list
LET LST = LIST 1, 2, 3, 4, 5     # List with initial values

# Append (your syntax is good!)
APPEND 5 TO LST                   # Single value
APPEND 1, 2, 3 TO LST            # Multiple values

# Access (simpler than your ACCESS keyword)
LET X = LST AT 0                  # Get first element
LET LAST = LST AT -1             # Negative index (last element)

# Remove
REMOVE 5 FROM LST                 # Remove by value (first occurrence)
REMOVE INDEX 2 FROM LST          # Remove by index
REMOVE ALL 5 FROM LST            # Remove all occurrences

# Length
LET LSTLEN = LENGTH LST          # Your syntax is perfect here

# Iteration (your syntax works!)
ITER 0 TO LENGTH LST WITH I START
    LET ITEM = LST AT I
    PRINT ITEM
END

# Set value at index
SET LST AT 2 TO 99               # Change element at index 2
`

const keys = {};
window.addEventListener("keydown", (e) => {
    keys[e.key] = true;
});

window.addEventListener("keyup", (e) => {
    keys[e.key] = false;
});
window.addEventListener("mousedown", (e) => {
    if (e.button === 0) keys["MouseLeft"]   = true;
    if (e.button === 1) keys["MouseMiddle"] = true;
    if (e.button === 2) keys["MouseRight"]  = true;
});

window.addEventListener("mouseup", (e) => {
    if (e.button === 0) keys["MouseLeft"]   = false;
    if (e.button === 1) keys["MouseMiddle"] = false;
    if (e.button === 2) keys["MouseRight"]  = false;
});
let wplenv = {
    outputToTerminalImmediately: (text, col = "green") => {
        // Create and append output line directly to terminal
        const outputLine = document.createElement('div');
        outputLine.classList.add('output-line');
        outputLine.textContent = text;
        outputLine.style.color = col; // or whatever color you prefer
        
        // Get the terminal element
        const terminal = document.getElementById('terminal');
        terminal.appendChild(outputLine);
        
        // Scroll to bottom to show new output
        window.scrollTo(0, document.body.scrollHeight);
    },

    execCmd: async (evaluatedCmd) => {
        let res = await commandManager.executeCommand(evaluatedCmd);
        res = res[0].toString();
        //console.log("exec res: "+res);
        //res = res.replaceAll("\"","\\\"");
        return res;
    },
    readFile: async (path) => {
        let output = await OS.readFile(path);
        if(output[1] == false){
            return null; // error // return just null for programming lang instead of output[2]
        } else {
            return output[0]; // file content
        }
    },
    writeFile: async (path, content) => {
        let exists = await OS.listfiles(path);
        if(exists[1] == true){
            return false;//return ["Cannot write to a directory!", "red", ""];
        }
        
        let output = OS.writeFile(path, content);
        
        if (output[0] === false) {
            return false;//return [output[1], "red", ""];
        } else {
            return true;//return ["File written successfully!", "green", ""];
        }
    },
    fileExists: async (path) => {
        let output = await OS.readFile(path);
        if (output[1]) {
            return true;
        } else {
            return false;
        }
    },
    isKeyDown: (key) => {
        return !!keys[key];
    },
    fptoi: (x) => {
        const n = Math.floor(Number(x));
        return isNaN(n) ? 0 : n;
    },
    rand: (min, max) => {
        min = Math.floor(Number(min));
        max = Math.floor(Number(max));

        if (isNaN(min) || isNaN(max)) return 0;

        if (min > max) [min, max] = [max, min];

        return Math.floor(Math.random() * (max - min + 1)) + min;
    },
    getUnixTimestamp: () => {
        if(!Modules.date){ return null; }
        return Math.floor(Date.now() / 1000);
    },
    getUnixMSTimestamp: () => {
        if(!Modules.date){ return null; }
        return Modules.date.getUnixMSTimestamp();
    },
    getCurrentDate: () => {
        if(!Modules.date){ return null; }
        return Modules.date.getCurrentDate();
    },
    getCurrentTime: () => {
        if(!Modules.date){ return null; }
        return Modules.date.getCurrentTime();
    },
    // user input

    waitForUserInput: async (prompt = "") => {
        return new Promise((resolve) => {
            const terminal = document.getElementById('terminal');
            
            // Find the last output line to append input to
            const outputLines = terminal.querySelectorAll('.output-line');
            const lastOutputLine = outputLines[outputLines.length - 1];
            
            let inputContainer;
            
            if (lastOutputLine && !prompt) {
                // If there's a previous output line and no prompt, append input to it
                inputContainer = lastOutputLine;
                
                // Add a space before the input
                const space = document.createTextNode(' ');
                inputContainer.appendChild(space);
            } else {
                // Create a new line for input (with prompt if provided)
                inputContainer = document.createElement('div');
                inputContainer.classList.add('output-line');
                
                if (prompt) {
                    const promptSpan = document.createElement('span');
                    promptSpan.textContent = prompt;
                    promptSpan.style.color = "green"; // Match your output color
                    inputContainer.appendChild(promptSpan);
                }
                
                terminal.appendChild(inputContainer);
            }
            
            // Create the input div
            const inputDiv = document.createElement('div');
            inputDiv.classList.add('cli-input-editable', 'wpl-input', 'inline-input');
            inputDiv.contentEditable = true;
            inputDiv.style.display = 'inline-block';
            inputDiv.style.minWidth = '10px';
            inputDiv.style.color = 'green'; // for now we'll just use green like the rest
            //inputDiv.style.border = '1px solid #ccc'; // Visual indicator
            //inputDiv.style.padding = '2px 4px';
            //inputDiv.style.marginLeft = '4px';
            
            inputContainer.appendChild(inputDiv);
            inputDiv.focus();

            let inputText = "";
            let isResolved = false;

            const handleKeyDown = (event) => {
                if (event.key === 'Enter' && !event.shiftKey) {
                    event.preventDefault();
                    
                    if (!isResolved) {
                        isResolved = true;
                        const finalInput = inputDiv.innerText.trim();
                        
                        // Clean up event listeners
                        inputDiv.removeEventListener('keydown', handleKeyDown);
                        inputDiv.removeEventListener('input', handleInput);
                        
                        // Make input non-editable but keep it visible
                        inputDiv.contentEditable = false;
                        inputDiv.style.border = 'none';
                        inputDiv.style.backgroundColor = 'transparent';
                        
                        resolve(finalInput);
                    }
                }
                else if (event.key === 'Escape') {
                    event.preventDefault();
                    
                    if (!isResolved) {
                        isResolved = true;
                        
                        // Clean up
                        inputDiv.removeEventListener('keydown', handleKeyDown);
                        inputDiv.removeEventListener('input', handleInput);
                        inputContainer.removeChild(inputDiv);
                        
                        resolve(""); // Empty input on escape
                    }
                }
                else if (event.ctrlKey && event.key.toLowerCase() === 'c') {
                    this.interruptExecution = true;
                    resolve();
                }
            };

            const handleInput = () => {
                // Auto-resize
                inputDiv.style.width = 'auto';
                inputDiv.style.width = (inputDiv.scrollWidth + 2) + 'px';
                
                // Store current input
                inputText = inputDiv.innerText;
            };

            inputDiv.addEventListener('keydown', handleKeyDown);
            inputDiv.addEventListener('input', handleInput);

            // Auto-resize initially
            setTimeout(() => {
                inputDiv.style.width = 'auto';
                inputDiv.style.width = (inputDiv.scrollWidth + 2) + 'px';
            }, 0);
        });
    },

    // audio
    loadAudio: async (src) => {
        if (!Modules.audio) {
            return false;
        }
        let output = await OS.readFile(src, true); // read as binary

        if (output[1] == false) {
            return false; // file doesnt exist
        }

        await Modules.audio.load(output[0]);
        if(!Modules.audio.currentBuffer){
            return false; // failed to load audio
        } else {
            return true;
        }
    },

    playAudio: () => {
        if (!Modules.audio) {
            return false;
        }
        Modules.audio.play();
    },

    pauseAudio: () => {
        if (!Modules.audio) {
            return false;
        }
        Modules.audio.pause();
    },

    isAudioPlaying: () => {
        if (!Modules.audio) {
            return false;
        }
        return Modules.audio.isPlaying;
    },

    getAudioCurrentTime: () => {
        if (!Modules.audio) {
            return false;
        }
        return Modules.audio.getCurrentTime();
    },
    getAudioDuration: () => {
        if (!Modules.audio) {
            return false;
        }
        return Modules.audio.getDuration();
    },
    setAudioVolume: (vol) => {
        if (!Modules.audio) {
            return false;
        }
        return Modules.audio.setVolume(Number(vol));
    },
    seekAudio: (time) => {
        if (!Modules.audio) {
            return false;
        }
        return Modules.audio.seek(Number(time));
    },
    stopAudio: () => {
        if (!Modules.audio) {
            return false;
        }
        return Modules.audio.stop();
    }
}

/* WEBOSPL COMPILER -> JS */
/*
class WOPLCOMPJS {
    constructor() {
        this.indentLevel = 0;
        this.declaredVars = new Set(); // track declared variables
    }

    indent() {
        return "    ".repeat(this.indentLevel);
    }

    compile(code) {
        const lines = code.split("\n");
        //let js = "";
        const stack = [];

        let js = "return (async () => {\n"; // start async wrapper
        this.indentLevel++;

        for (let rawLine of lines) {
            let line = rawLine.trim();
            if (!line || line.startsWith("#")) continue;

            // ===== FUNCTION =====
            if (line.startsWith("FUNCTION")) {
                const match = line.match(/^FUNCTION\s+(\w+)\s+PARAM\s+(.+)\s+START$/);
                if (!match) throw new Error("Invalid FUNCTION syntax: " + line);
                const name = match[1];
                const params = match[2].split(",").map(p=>p.trim()).filter(p=>p);
                js += `${this.indent()}function ${name}(${params.join(", ")}) {\n`;
                this.indentLevel++;
                continue;
            }

            // ===== END =====
            if (line === "END") {
                this.indentLevel--;
                js += `${this.indent()}}\n`;
                stack.pop();
                continue;
            }

            // ===== ELSE =====
            if (line === "ELSE") {
                this.indentLevel--;
                js += `${this.indent()}} else {\n`;
                this.indentLevel++;
                continue;
            }

            // ===== IF =====
            if (line.startsWith("IF")) {
                const condition = line.match(/IF (.+) THEN/)[1];
                js += `${this.indent()}if (${this.transformExpr(condition)}) {\n`;
                this.indentLevel++;
                stack.push("IF");
                continue;
            }

            // ===== WHILE =====
            if (line.startsWith("WHILE")) {
                const condition = line.match(/WHILE (.+) START/)[1];
                js += `${this.indent()}while (${this.transformExpr(condition)}) {\n`;
                this.indentLevel++;
                stack.push("WHILE");
                continue;
            }

            // ===== ITER =====
            if (line.startsWith("ITER")) {
                const [, start, end, varName] = line.match(/ITER (.+) TO (.+) WITH (\w+)/);
                js += `${this.indent()}for (let ${varName} = ${this.transformExpr(start)}; ${varName} <= ${this.transformExpr(end)}; ${varName}++) {\n`;
                this.indentLevel++;
                stack.push("ITER");
                continue;
            }

            // ===== RETURN =====
            if (line.startsWith("RETURN")) {
                const expr = line.substring(7);
                js += `${this.indent()}return ${this.transformExpr(expr)};\n`;
                continue;
            }

            // ===== PRINT =====
            if (line.startsWith("PRINT")) {
                const expr = line.substring(6);
                js += `${this.indent()}console.log(${this.transformPrint(expr)});\n`;
                // exec external function
                js += `${this.indent()}wplenv.outputToTerminalImmediately(${this.transformPrint(expr)});\n`;
                continue;
            }
            
            if (line.startsWith("EXEC")) {
                const match = line.match(/^EXEC\s+(.+)/);
                if (!match) throw new Error("Invalid EXEC syntax: " + line);
            
                const cmd = match[1].trim();
            
                js += `${this.indent()}await wplenv.execCmd(\`${cmd}\`);\n`;
                continue;
            }

            // ===== EXEC =====                          // maybe handle better - also  alow exec without var
            if (line.startsWith("LET") && ( line.includes("= EXEC") || line.includes("=EXEC")) ) {
                // Syntax: LET VAR = EXEC command args...
                const match = line.match(/LET (\w+) = EXEC (.+)/);
                if (!match) throw new Error("Invalid EXEC syntax: " + line);

                const varName = match[1];
                const cmd = match[2].trim(); // this could be "ls /" or similar
                console.log("EXEC CMD: " + cmd);

                // Check if variable already declared
                if (this.declaredVars.has(varName)) {
                    js += `${this.indent()}${varName} = await wplenv.execCmd(\`${cmd}\`);\n`;
                } else {
                    js += `${this.indent()}let ${varName} = await wplenv.execCmd(\`${cmd}\`);\n`;
                    this.declaredVars.add(varName);
                }
                continue;
            }

            // ===== LET =====
            if (line.startsWith("LET")) {
                // LIST creation
                if (line.includes("= LIST")) {
                    const [, name, items] = line.match(/LET (\w+) = LIST(?: (.+))?/);
                    if (this.declaredVars.has(name)) {
                        if (items) js += `${this.indent()}${name} = [${items}];\n`;
                        else js += `${this.indent()}${name} = [];\n`;
                    } else {
                        if (items) js += `${this.indent()}let ${name} = [${items}];\n`;
                        else js += `${this.indent()}let ${name} = [];\n`;
                        this.declaredVars.add(name);
                    }
                    continue;
                }
                // normal LET
                const [, name, value] = line.match(/LET (\w+) = (.+)/);
                if (this.declaredVars.has(name)) {
                    js += `${this.indent()}${name} = ${this.transformExpr(value)};\n`;
                } else {
                    js += `${this.indent()}let ${name} = ${this.transformExpr(value)};\n`;
                    this.declaredVars.add(name);
                }
                continue;
            }

            // ===== SET =====
            if (line.startsWith("SET")) {
                const [, listName, index, value] = line.match(/SET (\w+) AT (.+) TO (.+)/);
                js += `${this.indent()}${listName}[${this.transformExpr(index)}] = ${this.transformExpr(value)};\n`;
                continue;
            }

            if (line.startsWith("SLEEP")) {
                const expr = line.substring(6).trim();
                const ms = expr ? this.transformExpr(expr) : "0";
                js += `${this.indent()}await new Promise(r => setTimeout(r, ${ms}));\n`;
                continue;
            }

            // ===== GRAPHICS COMMANDS =====
            if (/^GINIT/.test(line)) {
                const match = line.match(/GINIT(?:\s+(.+))?/);
                let width = 800, height = 600;
                if (match && match[1]) {
                    const args = match[1].split(",").map(a => a.trim());
                    if (args.length === 2) {
                        width = this.transformExpr(args[0]);
                        height = this.transformExpr(args[1]);
                    }
                }
                js += `${this.indent()}Modules.gfx.init(${width}, ${height});\n`;
                continue;
            }

            if (/^GCLOSE/.test(line)) {
                js += `${this.indent()}Modules.gfx.close();\n`;
                continue;
            }

            if (/^GCLEAR/.test(line)) {
                const match = line.match(/GCLEAR(?:\s+(.+))?/);
                let color = '"#000000"';
                if (match && match[1]) color = this.transformExpr(match[1]);
                js += `${this.indent()}Modules.gfx.clear(${color});\n`;
                continue;
            }

            if (/^GPIXEL/.test(line)) {
                const args = line.match(/GPIXEL\s+(.+)/)[1].split(",").map(a => a.trim());
                const x = this.transformExpr(args[0]);
                const y = this.transformExpr(args[1]);
                const color = args[2] ? this.transformExpr(args[2]) : '"#00ff00"';
                js += `${this.indent()}Modules.gfx.drawPixel(${x}, ${y}, ${color});\n`;
                continue;
            }

            if (/^GLINE/.test(line)) {
                const args = line.match(/GLINE\s+(.+)/)[1].split(",").map(a => a.trim());
                const x1 = this.transformExpr(args[0]);
                const y1 = this.transformExpr(args[1]);
                const x2 = this.transformExpr(args[2]);
                const y2 = this.transformExpr(args[3]);
                const color = args[4] ? this.transformExpr(args[4]) : '"#00ff00"';
                const width = args[5] ? this.transformExpr(args[5]) : 1;
                js += `${this.indent()}Modules.gfx.drawLine(${x1}, ${y1}, ${x2}, ${y2}, ${color}, ${width});\n`;
                continue;
            }

            if (/^GRECT/.test(line)) {
                const args = line.match(/GRECT\s+(.+)/)[1].split(",").map(a => a.trim());
                const x = this.transformExpr(args[0]);
                const y = this.transformExpr(args[1]);
                const w = this.transformExpr(args[2]);
                const h = this.transformExpr(args[3]);
                const color = args[4] ? this.transformExpr(args[4]) : '"#00ff00"';
                const width = args[5] ? this.transformExpr(args[5]) : 1;
                js += `${this.indent()}Modules.gfx.drawRect(${x}, ${y}, ${w}, ${h}, ${color}, ${width});\n`;
                continue;
            }

            if (/^GFRECT/.test(line)) {
                const args = line.match(/GFRECT\s+(.+)/)[1].split(",").map(a => a.trim());
                const x = this.transformExpr(args[0]);
                const y = this.transformExpr(args[1]);
                const w = this.transformExpr(args[2]);
                const h = this.transformExpr(args[3]);
                const color = args[4] ? this.transformExpr(args[4]) : '"#00ff00"';
                js += `${this.indent()}Modules.gfx.fillRect(${x}, ${y}, ${w}, ${h}, ${color});\n`;
                continue;
            }

            if (/^GCIRCLE/.test(line)) {
                const args = line.match(/GCIRCLE\s+(.+)/)[1].split(",").map(a => a.trim());
                const x = this.transformExpr(args[0]);
                const y = this.transformExpr(args[1]);
                const r = this.transformExpr(args[2]);
                const color = args[3] ? this.transformExpr(args[3]) : '"#00ff00"';
                const width = args[4] ? this.transformExpr(args[4]) : 1;
                js += `${this.indent()}Modules.gfx.drawCircle(${x}, ${y}, ${r}, ${color}, ${width});\n`;
                continue;
            }

            if (/^GFCIRCLE/.test(line)) {
                const args = line.match(/GFCIRCLE\s+(.+)/)[1].split(",").map(a => a.trim());
                const x = this.transformExpr(args[0]);
                const y = this.transformExpr(args[1]);
                const r = this.transformExpr(args[2]);
                const color = args[3] ? this.transformExpr(args[3]) : '"#00ff00"';
                js += `${this.indent()}Modules.gfx.fillCircle(${x}, ${y}, ${r}, ${color});\n`;
                continue;
            }

            if (/^GTEXT/.test(line)) {
                const args = line.match(/GTEXT\s+(.+)/)[1].split(",").map(a => a.trim());
                const x = this.transformExpr(args[0]);
                const y = this.transformExpr(args[1]);
                const text = this.transformExpr(args[2]);
                const color = args[3] ? this.transformExpr(args[3]) : '"#00ff00"';
                const size = args[4] ? this.transformExpr(args[4]) : 16;
                js += `${this.indent()}Modules.gfx.drawText(${x}, ${y}, ${text}, ${color}, ${size});\n`;
                continue;
            }

        }

        // ===== FALLBACK =====
        js += `${this.indent()}// Unknown: ${line}\n`;

        this.indentLevel--;
        js += "})();\n";
        return js;
        
    }

    transformExpr(expr) {
        expr = expr.trim();

        // CALL syntax
        expr = expr.replace(/CALL (\w+) WITH (.+)/g, (_, fn, args) => `${fn}(${args})`);

        // LIST
        expr = expr.replace(/LIST (.+)/g, (_, items) => `[${items}]`);
        expr = expr.replace(/\bLIST\b/g, "[]");

        // LENGTH
        expr = expr.replace(/LENGTH (\w+)/g, (_, name) => `${name}.length`);

        // ACCESS: LST AT X
        expr = expr.replace(/(\w+) AT (.+)/g, (_, arr, idx) => `${arr}[${idx}]`);


        expr = expr.replace(/ISDOWN\s+(".*?")/g, (_, key) => {
            return `wplenv.isKeyDown(${key})`;
        });

        return expr;
    }

    transformPrint(expr) {
        // Split on strings and variables
        let parts = [];
        let buffer = "";
        let inString = false;

        for (let i = 0; i < expr.length; i++) {
            const c = expr[i];
            if (c === '"') {
                inString = !inString;
                buffer += c;
                continue;
            }
            if (!inString && c === " ") {
                if (buffer) { parts.push(buffer); buffer = ""; }
                continue;
            }
            buffer += c;
        }
        if (buffer) parts.push(buffer);

        // Join strings and variables with +
        return parts.map(p => {
            if (p.startsWith('"') && p.endsWith('"')) return p;
            else return p;
        }).join(" + ");
    }
}*/








//// #########################################################################
//// #########################################################################
//// #########################################################################
//// #########################################################################
//// #########################################################################

// ------------   old version of wopl to js compiler  --------------
/*
class WOPLCOMPJS {
    constructor() {
        this.indentLevel = 0;
        this.declaredVars = new Set();
        this.functions = new Set();
    }

    indent() {
        return "    ".repeat(this.indentLevel);
    }

    compile(code) {
        // reset
        this.declaredVars = new Set();
        this.functions = new Set();
        this.indentLevel = 0;


        const lines = code.split("\n");
        let js = "return (async () => {\n";
        this.indentLevel++;

        for (let rawLine of lines) {
            let line = rawLine.trim();
            if (!line || line.startsWith("#")) continue;

            let handled = false;

            // ===== FUNCTION =====
            if (line.startsWith("FUNCTION")) {
                const match = line.match(/^FUNCTION\s+(\w+)\s+PARAM\s+(.+)\s+START$/);
                if (!match) throw new Error("Invalid FUNCTION syntax: " + line);

                const name = match[1];
                const params = match[2].split(",").map(p => p.trim()).filter(p => p);
                
                // save funcs
                this.functions.add(name);

                js += `${this.indent()}async function ${name}(${params.join(", ")}) {\n`;
                this.indentLevel++;
                handled = true;
                continue;
            }

            // ===== END =====
            if (line === "END") {
                this.indentLevel--;
                js += `${this.indent()}}\n`;
                handled = true;
                continue;
            }

            // ===== ELSEIF =====
            if (line.startsWith("ELSEIF")) {
                const condition = line.match(/ELSEIF (.+) THEN/)[1];
                js += `${this.indent()}} else if (${this.transformExpr(condition)}) {\n`;
                this.indentLevel++;
                handled = true;
                continue;
            }

            // ===== ELSE =====
            if (line === "ELSE") {
                this.indentLevel--;
                js += `${this.indent()}} else {\n`;
                this.indentLevel++;
                handled = true;
                continue;
            }

            // ===== IF =====
            if (line.startsWith("IF")) {
                const condition = line.match(/IF (.+) THEN/)[1];
                js += `${this.indent()}if (${this.transformExpr(condition)}) {\n`;
                this.indentLevel++;
                handled = true;
                continue;
            }

            // ===== WHILE =====
            if (line.startsWith("WHILE")) {
                const condition = line.match(/WHILE (.+) START/)[1];
                js += `${this.indent()}while (${this.transformExpr(condition)}) {\n`;
                this.indentLevel++;
                handled = true;
                continue;
            }

            // ===== ITER (FIXED) =====
            if (line.startsWith("ITER")) {
                const match = line.match(/^ITER\s+(.+?)\s+TO\s+(.+?)(?:\s+STEP\s+(.+?))?\s+WITH\s+(\w+)$/);
                if (!match) throw new Error("Invalid ITER syntax: " + line);

                const start = this.transformExpr(match[1]);
                const end = this.transformExpr(match[2]);
                const step = match[3] ? this.transformExpr(match[3]) : "1"; // default step
                const varName = match[4];

                js += `${this.indent()}for (let ${varName} = ${start}; `;

                // Determine loop direction based on step
                if (step.trim().startsWith("-")) {
                    js += `${varName} >= ${end}; `;
                } else {
                    js += `${varName} <= ${end}; `;
                }

                js += `${varName} += ${step}) {\n`;
                this.indentLevel++;
                handled = true;
                continue;
            }

            // ===== RETURN =====
            if (line.startsWith("RETURN")) {
                const expr = line.substring(7);
                js += `${this.indent()}return ${this.transformExpr(expr)};\n`;
                handled = true;
                continue;
            }

            // ===== PRINT =====
            if (line.startsWith("PRINT")) {
                const expr = line.substring(6);
                const out = this.transformPrint(expr);

                js += `${this.indent()}console.log(${out});\n`;
                js += `${this.indent()}wplenv.outputToTerminalImmediately(${out});\n`;

                handled = true;
                continue;
            }

            // ===== EXEC (no LET) =====
            if (line.startsWith("EXEC")) {
                const match = line.match(/^EXEC\s+(.+)/);
                const cmd = match[1].trim();
                js += `${this.indent()}await wplenv.execCmd(\`${cmd}\`);\n`;
                handled = true;
                continue;
            }

            // ===== EXEC with LET =====
            if (line.startsWith("LET") && line.includes("EXEC")) {
                const match = line.match(/LET (\w+) = EXEC (.+)/);
                const varName = match[1];
                const cmd = match[2].trim();

                if (this.declaredVars.has(varName)) {
                    js += `${this.indent()}${varName} = await wplenv.execCmd(\`${cmd}\`);\n`;
                } else {
                    js += `${this.indent()}let ${varName} = await wplenv.execCmd(\`${cmd}\`);\n`;
                    this.declaredVars.add(varName);
                }

                handled = true;
                continue;
            }

            // ===== LET =====
            //if (line.startsWith("LET")) {
            //    if (line.includes("= LIST")) {
            //        const [, name, items] = line.match(/LET (\w+) = LIST(?: (.+))?/);

            //        const value = items ? `[${items}]` : "[]";

            //        if (this.declaredVars.has(name)) {
            //            js += `${this.indent()}${name} = ${value};\n`;
            //        } else {
            //            js += `${this.indent()}let ${name} = ${value};\n`;
            //            this.declaredVars.add(name);
            //        }
            //    } else {
            //        const [, name, value] = line.match(/LET (\w+) = (.+)/);

            //        if (this.declaredVars.has(name)) {
            //            js += `${this.indent()}${name} = ${this.transformExpr(value)};\n`;
            //        } else {
            //            js += `${this.indent()}let ${name} = ${this.transformExpr(value)};\n`;
            //            this.declaredVars.add(name);
            //        }
            //    }

            //    handled = true;
            //    continue;
            //}

            // issue: sometimes doesnt add "let" before variable, even when not defined
            // CAUSES issues: function can redefine global variables maybe they should?
            if (line.startsWith("LET")) {
                if (line.includes("= LIST")) {
                    const [, name, items] = line.match(/LET\s+(\w+)\s*=\s*LIST(?:\s+(.+))?/);
                    const value = items ? `[${items}]` : "[]";

                    if (this.declaredVars.has(name)) {
                        js += `${this.indent()}${name} = ${value};\n`;
                    } else {
                        js += `${this.indent()}let ${name} = ${value};\n`;
                        this.declaredVars.add(name);
                    }
                } else {
                    const [, name, value] = line.match(/LET\s+(\w+)\s*=\s*(.+)/);
                    console.log("name:   "+name)
                    if (this.declaredVars.has(name)) {
                        js += `${this.indent()}${name} = ${this.transformExpr(value)};\n`;
                    } else {
                        js += `${this.indent()}let ${name} = ${this.transformExpr(value)};\n`;
                        this.declaredVars.add(name);
                    }
                }

                handled = true;
                continue;
            }

            // ===== SET =====
            if (line.startsWith("SET")) {
                const [, listName, index, value] = line.match(/SET (\w+) AT (.+) TO (.+)/);
                js += `${this.indent()}${listName}[${this.transformExpr(index)}] = ${this.transformExpr(value)};\n`;
                handled = true;
                continue;
            }

            // ===== SLEEP =====
            if (line.startsWith("SLEEP")) {
                const expr = line.substring(6).trim();
                js += `${this.indent()}await new Promise(r => setTimeout(r, ${this.transformExpr(expr || "0")}));\n`;
                handled = true;
                continue;
            }

            if (line.startsWith("APPEND")) {
                const match = line.match(/^APPEND (.+) TO (\w+)/);
                if (!match) throw new Error("Invalid APPEND syntax: " + line);

                const values = match[1].split(",").map(v => this.transformExpr(v.trim()));
                const list = match[2];

                for (let v of values) {
                    js += `${this.indent()}${list}.push(${v});\n`;
                }

                handled = true;
                continue;
            }

            if (line.startsWith("REMOVE INDEX")) {
                const match = line.match(/^REMOVE INDEX (.+) FROM (\w+)/);
                if (!match) throw new Error("Invalid REMOVE INDEX syntax: " + line);

                const index = this.transformExpr(match[1]);
                const list = match[2];

                js += `${this.indent()}${list}.splice(${index}, 1);\n`;

                handled = true;
                continue;
            }

            if (line.startsWith("REMOVE")) {
                const match = line.match(/^REMOVE (.+) FROM (\w+)/);
                if (!match) throw new Error("Invalid REMOVE syntax: " + line);

                const value = this.transformExpr(match[1]);
                const list = match[2];

                js += `${this.indent()}let __idx = ${list}.indexOf(${value});\n`;
                js += `${this.indent()}if (__idx !== -1) ${list}.splice(__idx, 1);\n`;

                handled = true;
                continue;
            }

            if (line.startsWith("REMOVE")) {
                const match = line.match(/^REMOVE (.+) FROM (\w+)/);
                if (!match) throw new Error("Invalid REMOVE syntax: " + line);

                const value = this.transformExpr(match[1]);
                const list = match[2];

                js += `${this.indent()}let __idx = ${list}.indexOf(${value});\n`;
                js += `${this.indent()}if (__idx !== -1) ${list}.splice(__idx, 1);\n`;

                handled = true;
                continue;
            }

            if (line === "BREAK") {
                js += `${this.indent()}break;\n`;
                handled = true;
                continue;
            }

            if (line === "CONTINUE") {
                js += `${this.indent()}continue;\n`;
                handled = true;
                continue;
            }

            

            // ===== GRAPHICS =====
            if (/^GINIT/.test(line)) {
                const match = line.match(/GINIT(?:\s+(.+))?/);
                let width = 800, height = 600;
                if (match && match[1]) {
                    const args = match[1].split(",").map(a => a.trim());
                    if (args.length === 2) {
                        width = this.transformExpr(args[0]);
                        height = this.transformExpr(args[1]);
                    }
                }
                js += `${this.indent()}Modules.gfx.init(${width}, ${height});\n`;
                continue;
            }

            if (/^GCLOSE/.test(line)) {
                js += `${this.indent()}Modules.gfx.close();\n`;
                continue;
            }

            if (/^GCLEAR/.test(line)) {
                const match = line.match(/GCLEAR(?:\s+(.+))?/);
                let color = '"#000000"';
                if (match && match[1]) color = this.transformExpr(match[1]);
                js += `${this.indent()}Modules.gfx.clear(${color});\n`;
                continue;
            }

            if (/^GPIXEL/.test(line)) {
                const args = line.match(/GPIXEL\s+(.+)/)[1].split(",").map(a => a.trim());
                const x = this.transformExpr(args[0]);
                const y = this.transformExpr(args[1]);
                const color = args[2] ? this.transformExpr(args[2]) : '"#00ff00"';
                js += `${this.indent()}Modules.gfx.drawPixel(${x}, ${y}, ${color});\n`;
                continue;
            }

            if (/^GLINE/.test(line)) {
                const args = line.match(/GLINE\s+(.+)/)[1].split(",").map(a => a.trim());
                const x1 = this.transformExpr(args[0]);
                const y1 = this.transformExpr(args[1]);
                const x2 = this.transformExpr(args[2]);
                const y2 = this.transformExpr(args[3]);
                const color = args[4] ? this.transformExpr(args[4]) : '"#00ff00"';
                const width = args[5] ? this.transformExpr(args[5]) : 1;
                js += `${this.indent()}Modules.gfx.drawLine(${x1}, ${y1}, ${x2}, ${y2}, ${color}, ${width});\n`;
                continue;
            }

            if (/^GRECT/.test(line)) {
                const args = line.match(/GRECT\s+(.+)/)[1].split(",").map(a => a.trim());
                const x = this.transformExpr(args[0]);
                const y = this.transformExpr(args[1]);
                const w = this.transformExpr(args[2]);
                const h = this.transformExpr(args[3]);
                const color = args[4] ? this.transformExpr(args[4]) : '"#00ff00"';
                const width = args[5] ? this.transformExpr(args[5]) : 1;
                js += `${this.indent()}Modules.gfx.drawRect(${x}, ${y}, ${w}, ${h}, ${color}, ${width});\n`;
                continue;
            }

            if (/^GFRECT/.test(line)) {
                const args = line.match(/GFRECT\s+(.+)/)[1].split(",").map(a => a.trim());
                const x = this.transformExpr(args[0]);
                const y = this.transformExpr(args[1]);
                const w = this.transformExpr(args[2]);
                const h = this.transformExpr(args[3]);
                const color = args[4] ? this.transformExpr(args[4]) : '"#00ff00"';
                js += `${this.indent()}Modules.gfx.fillRect(${x}, ${y}, ${w}, ${h}, ${color});\n`;
                continue;
            }

            if (/^GCIRCLE/.test(line)) {
                const args = line.match(/GCIRCLE\s+(.+)/)[1].split(",").map(a => a.trim());
                const x = this.transformExpr(args[0]);
                const y = this.transformExpr(args[1]);
                const r = this.transformExpr(args[2]);
                const color = args[3] ? this.transformExpr(args[3]) : '"#00ff00"';
                const width = args[4] ? this.transformExpr(args[4]) : 1;
                js += `${this.indent()}Modules.gfx.drawCircle(${x}, ${y}, ${r}, ${color}, ${width});\n`;
                continue;
            }

            if (/^GFCIRCLE/.test(line)) {
                const args = line.match(/GFCIRCLE\s+(.+)/)[1].split(",").map(a => a.trim());
                const x = this.transformExpr(args[0]);
                const y = this.transformExpr(args[1]);
                const r = this.transformExpr(args[2]);
                const color = args[3] ? this.transformExpr(args[3]) : '"#00ff00"';
                js += `${this.indent()}Modules.gfx.fillCircle(${x}, ${y}, ${r}, ${color});\n`;
                continue;
            }

            if (/^GTEXT/.test(line)) {
                const args = line.match(/GTEXT\s+(.+)/)[1].split(",").map(a => a.trim());
                const x = this.transformExpr(args[0]);
                const y = this.transformExpr(args[1]);
                const text = this.transformExpr(args[2]);
                const color = args[3] ? this.transformExpr(args[3]) : '"#00ff00"';
                const size = args[4] ? this.transformExpr(args[4]) : 16;
                js += `${this.indent()}Modules.gfx.drawText(${x}, ${y}, ${text}, ${color}, ${size});\n`;
                continue;
            }

            /// maybe function being called directly
            const funcCallMatch = line.match(/^(\w+)\s*\((.*)\)$/);
            if (funcCallMatch) {
                const fn = funcCallMatch[1];
                const args = funcCallMatch[2];

                if (this.functions.has(fn)) {
                    js += `${this.indent()}await ${fn}(${args});\n`;
                    handled = true;
                    continue;
                } else {
                    // unknown function, maybe runtime global
                    js += `${this.indent()}${fn}(${args});\n`;
                    handled = true;
                    continue;
                }
            }


            // maybe add here check if its a variable redefinition or function call by checking defined ones

            // ===== FALLBACK =====
            if (!handled) {
                js += `${this.indent()}// Unknown: ${line}\n`;
            }
        }

        this.indentLevel--;
        js += "})();\n";
        return js;
    }

    // ===== FIXED EXPRESSION =====
    transformExpr(expr) {
        expr = expr.trim();

        // maybe does issues, better use only with one variable/value like: LET Y = FPTOI X
        //expr = expr.replace(/FPTOI\s+(.+)/g, (_, val) => {
        //    return `wplenv.fptoi(${this.transformExpr(val)})`;
        //});

        // new version: INTRODUCED: parentheses!!!
        // RAND(a, b)
        // math functions ------
        expr = expr.replace(/\bRAND\s*\((.+?),(.+?)\)/g,
            (_, a, b) => `wplenv.rand(${this.transformExpr(a)}, ${this.transformExpr(b)})`
        );

        // FPTOI(x)
        expr = expr.replace(/\bFPTOI\s*\((.+?)\)/g,
            (_, x) => `wplenv.fptoi(${this.transformExpr(x)})`
        );

        // ABS(x)
        expr = expr.replace(/\bABS\s*\((.+?)\)/g,
            (_, x) => `Math.abs(${this.transformExpr(x)})`
        );

        // SQRT(x)
        expr = expr.replace(/\bSQRT\s*\((.+?)\)/g,
            (_, x) => `Math.sqrt(${this.transformExpr(x)})`
        );

        // SIN(x)
        expr = expr.replace(/\bSIN\s*\((.+?)\)/g,
            (_, x) => `Math.sin(${this.transformExpr(x)})`
        );

        // COS(x)
        expr = expr.replace(/\bCOS\s*\((.+?)\)/g,
            (_, x) => `Math.cos(${this.transformExpr(x)})`
        );
        //--------------


        expr = expr.replace(/GUSED(?=\s|$|\))/g, (match, offset) => {
            if (this._isInsideQuotes(expanded, offset)) return match;
            return Modules.gfx.isUsed().toString();
        });

        expr = expr.replace(/\bGUSED\b/g, (_, key) => ` Modules.gfx.isUsed().toString() `);

        // CALL → await
        expr = expr.replace(/CALL (\w+) WITH (.+)/g, (_, fn, args) => {
            return `await ${fn}(${args})`;
        });

        // doesnt work if function is called without var like: FUNC(1,2,3) and not LET Y = ...., this is maybe because transformExpr is only called on var assignment and not begining of line
        // above still support old syntax,but eventually remove later (backward compatibility)
        // support function calls with parentheses: LET RES = UserFunc(X, Y)
        expr = expr.replace(/\b(\w+)\s*\((.*?)\)/g, (_, fn, args) => {
            if (this.functions.has(fn)) {
                return `await ${fn}(${args})`;
            }
            return `${fn}(${args})`;
        });
        // maybe later also save func params for tracking if user passes correct count

        // LENGTH
        expr = expr.replace(/LENGTH (\w+)/g, (_, name) => `${name}.length`);

        // still not working!!!! maybe add arrays/lists as "real" extra typeso they have funcs like arr[i] or arr.at(i) or arr.length
        // FIXED ACCESS (non-greedy)
        expr = expr.replace(/(\w+)\s+AT\s+([^\s]+)/g, (_, arr, idx) => `${arr}[${idx}]`);

        // LIST
        expr = expr.replace(/LIST (.+)/g, (_, items) => `[${items}]`);
        expr = expr.replace(/\bLIST\b/g, "[]");

        // INPUT
        expr = expr.replace(/ISDOWN\s+(".*?")/g, (_, key) => `wplenv.isKeyDown(${key})`);

        expr = expr.replace(/\bMOUSEPOS\b/g, (_, key) => ` Object.values(Modules.gfx.getMousePos()) `);

        return expr;
    }

    // print doesnt suppoort expr for now like PRINT "abs: " ABS(-8) , willfail
    // but print is special:   it supports smth like PRINT "VAR:" VAR 
    transformPrint(expr) {
        let parts = [];
        let buffer = "";
        let inString = false;

        for (let c of expr) {
            if (c === '"') {
                inString = !inString;
                buffer += c;
                continue;
            }

            if (!inString && c === " ") {
                if (buffer) {
                    parts.push(buffer);
                    buffer = "";
                }
                continue;
            }

            buffer += c;
        }

        if (buffer) parts.push(buffer);

        return parts.join(" + ");
    }
}*/

// old version
//// #########################################################################
//// #########################################################################
//// #########################################################################
//// #########################################################################
// new:

// ============================================================
//  WOPL Compiler  –  JavaScript backend
//  Supports: variables, functions, classes, built-in Array &
//  String types, control flow, graphics, exec, sleep, I/O
// ============================================================

// ──────────────────────────────────────────────────────────────
//  Runtime helpers injected into every compiled program.
//  Paste this block alongside wplenv in your HTML page.
// ──────────────────────────────────────────────────────────────
const WOPL_RUNTIME = `
// ── WOPLString ───────────────────────────────────────────────
class WOPLString {
    constructor(v = "") { this._v = String(v); }

    // primitives
    get length()            { return this._v.length; }
    toString()              { return this._v; }
    valueOf()               { return this._v; }

    // methods
    contains(sub)           { return this._v.includes(String(sub instanceof WOPLString ? sub._v : sub)); }
    startsWith(sub)         { return this._v.startsWith(String(sub instanceof WOPLString ? sub._v : sub)); }
    endsWith(sub)           { return this._v.endsWith(String(sub instanceof WOPLString ? sub._v : sub)); }
    upper()                 { return new WOPLString(this._v.toUpperCase()); }
    lower()                 { return new WOPLString(this._v.toLowerCase()); }
    trim()                  { return new WOPLString(this._v.trim()); }
    replace(a, b)           { return new WOPLString(this._v.replaceAll(String(a instanceof WOPLString ? a._v : a), String(b instanceof WOPLString ? b._v : b))); }
    split(sep)              { return new WOPLArray(this._v.split(String(sep instanceof WOPLString ? sep._v : sep)).map(s => new WOPLString(s))); }
    splitlines()            { return new WOPLArray(this._v.split(/\\r?\\n|\\r|\\n/g).map(s => new WOPLString(s))); }
    
    charAt(i)               { return new WOPLString(this._v.charAt(Number(i))); }
    indexOf(sub)            { return this._v.indexOf(String(sub instanceof WOPLString ? sub._v : sub)); }
    substring(a, b)         { return new WOPLString(b !== undefined ? this._v.substring(Number(a), Number(b)) : this._v.substring(Number(a))); }
    toNumber()              { return Number(this._v); }
    repeat(n)               { return new WOPLString(this._v.repeat(Number(n))); }

    // operator helpers
    concat(other)           { return new WOPLString(this._v + String(other instanceof WOPLString ? other._v : other)); }
    equals(other)           { return this._v === String(other instanceof WOPLString ? other._v : other); }
}

// ── WOPLArray ─────────────────────────────────────────────────
class WOPLArray {
    constructor(items = []) { this._items = Array.isArray(items) ? [...items] : []; }

    get length()            { return this._items.length; }
    toString()              { return "[" + this._items.map(x => x instanceof WOPLString ? '"' + x._v + '"' : String(x)).join(", ") + "]"; }

    get(i)                  { const v = this._items[Number(i)]; return v === undefined ? null : v; }
    set(i, v)               { this._items[Number(i)] = v; return v; }
    push(...vals)           { this._items.push(...vals); return this; }
    pop()                   { return this._items.pop() ?? null; }
    shift()                 { return this._items.shift() ?? null; }
    unshift(v)              { this._items.unshift(v); return this; }
    contains(v)             { return this._items.some(x => woplEq(x, v)); }
    indexOf(v)              { return this._items.findIndex(x => woplEq(x, v)); }
    removeAt(i)             { this._items.splice(Number(i), 1); return this; }
    remove(v)               { const i = this.indexOf(v); if (i !== -1) this._items.splice(i, 1); return this; }
    slice(a, b)             { return new WOPLArray(b !== undefined ? this._items.slice(Number(a), Number(b)) : this._items.slice(Number(a))); }
    concat(other)           { return new WOPLArray([...this._items, ...(other instanceof WOPLArray ? other._items : [other])]); }
    join(sep)               { return new WOPLString(this._items.map(x => x instanceof WOPLString ? x._v : String(x)).join(String(sep instanceof WOPLString ? sep._v : sep))); }
    reverse()               { return new WOPLArray([...this._items].reverse()); }
    // raw JS iterator so FOR..OF works internally if needed
    [Symbol.iterator]()     { return this._items[Symbol.iterator](); }
}

// ── File (descriptor) ─────────────────────────────────────────────────
class File {
    constructor(name = "") { this._name = name.toString(); } // name is a WOPLString object!!!!

    get name() { return new WOPLString(this._name); } // need to also convert back to WOPLString
    async read() { return new WOPLString(await wplenv.readFile(this._name)); }
    async exists() { return await wplenv.fileExists(this._name); }
    async write(content) { return await wplenv.writeFile(this._name, content.toString()); }

}

// audio player
class WOPLAudioPlayer {
    constructor() { }

    async load(src) { return await wplenv.loadAudio(src.toString()); }
    play() { wplenv.playAudio(); }
    pause() { wplenv.pauseAudio(); }
    get isPlaying() { return wplenv.isAudioPlaying(); }

    getCurrentTime() { return wplenv.getAudioCurrentTime(); }
    getDuration() { return wplenv.getAudioDuration(); }
    setVolume(vol) { wplenv.setAudioVolume(Number(vol)); }
    seek(time) { wplenv.seekAudio(Number(time)); }
    stop() { wplenv.stopAudio(); }

}

// equality helper used by array.contains etc.
function woplEq(a, b) {
    if (a instanceof WOPLString && b instanceof WOPLString) return a._v === b._v;
    if (a instanceof WOPLString) return a._v === String(b);
    if (b instanceof WOPLString) return String(a) === b._v;
    return a === b;
}

// coerce anything to a printable string
function woplStr(v) {
    if (v instanceof WOPLString) return v._v;
    if (v instanceof WOPLArray)  return v.toString();
    if (v === null || v === undefined) return "null";
    return String(v);
}
`;

// ──────────────────────────────────────────────────────────────
//  Tokeniser
// ──────────────────────────────────────────────────────────────
class Token {
    constructor(type, value, raw) {
        this.type  = type;   // 'KW','IDENT','NUMBER','STRING','OP','PUNCT','EOL'
        this.value = value;
        this.raw   = raw ?? value;
    }
}

const KWS = new Set([
    "LET","SET","PRINT","IF","THEN","ELSE","ELSEIF","END","WHILE",
    "ITER","TO","STEP","WITH","FUNCTION","PARAM","RETURN","EXEC","SLEEP",
    "APPEND","REMOVE","INDEX","FROM","AT","LIST","BREAK","CONTINUE",
    "CALL","RAND","FPTOI","ABS","SQRT","SIN","COS","LENGTH","ISDOWN",
    "MOUSEPOS","GUSED","GINIT","GCLOSE","GCLEAR","GPIXEL","GLINE",
    "GRECT","GFRECT","GCIRCLE","GFCIRCLE","GTEXT", 
    
    // date
    "GETUNIX", "GETDATE", "GETTIME", "GETUNIXMS",
    // new keywords
    "CLASS","METHOD","NEW","FIELD","EXTENDS","SUPER","INSTANCEOF",
    "AND","OR","NOT","TRUE","FALSE","NULL",
    "STRING","ARRAY","FOREACH","IN",
    // Note: START is intentionally NOT here — it's matched by .value only
    // where structurally expected (WHILE...START, FUNCTION...START) so
    // users can freely use "Start", "start" etc. as identifiers/params.
]);

function tokeniseLine(line) {
    const tokens = [];
    let i = 0;
    const len = line.length;

    while (i < len) {
        // skip whitespace
        if (line[i] === " " || line[i] === "\t") { i++; continue; }

        // comment
        if (line[i] === "#") break;

        // string literal
        if (line[i] === '"') {
            let j = i + 1;
            let str = "";
            while (j < len && line[j] !== '"') {
                if (line[j] === "\\") { str += line[j] + (line[j+1] ?? ""); j += 2; }
                else str += line[j++];
            }
            tokens.push(new Token("STRING", str, `"${str}"`));
            i = j + 1;
            continue;
        }

        // dot — always PUNCT (member access); never start a number
        if (line[i] === ".") {
            tokens.push(new Token("PUNCT", "."));
            i++;
            continue;
        }

        // number  (digits only — dot is handled above as PUNCT)
        if (/\d/.test(line[i]) || (line[i] === "-" && /\d/.test(line[i+1] ?? "") && tokens.length === 0)) {
            let j = i; let num = "";
            if (line[j] === "-") { num += "-"; j++; }
            // allow one decimal point inside a number
            let hasDot = false;
            while (j < len && (/\d/.test(line[j]) || (line[j] === "." && !hasDot && /\d/.test(line[j+1] ?? "")))) {
                if (line[j] === ".") hasDot = true;
                num += line[j++];
            }
            tokens.push(new Token("NUMBER", Number(num), num));
            i = j;
            continue;
        }

        // identifier / keyword
        if (/[A-Za-z_]/.test(line[i])) {
            let j = i;
            while (j < len && /[A-Za-z0-9_]/.test(line[j])) j++;
            const word = line.slice(i, j);
            const upper = word.toUpperCase();
            if (KWS.has(upper))       tokens.push(new Token("KW", upper, word));
            else if (upper === "TRUE") tokens.push(new Token("BOOL", true, word));
            else if (upper === "FALSE")tokens.push(new Token("BOOL", false, word));
            else if (upper === "NULL") tokens.push(new Token("NULL", null, word));
            else                       tokens.push(new Token("IDENT", word, word));
            i = j;
            continue;
        }

        // multi-char operators  (order matters — longest match first)
        const two = line.slice(i, i+2);
        if (["<=",">=","!=","==","&&","||","**","+=","-=","*=","/=","++","--"].includes(two)) {
            tokens.push(new Token("OP", two)); i += 2; continue;
        }

        // single-char operators / punctuation
        const ch = line[i];
        if ("+-*/%^<>=!".includes(ch)) { tokens.push(new Token("OP", ch)); i++; continue; }
        if ("()[]{},.;:".includes(ch)) { tokens.push(new Token("PUNCT", ch)); i++; continue; }

        // unknown → treat as ident
        tokens.push(new Token("IDENT", ch, ch));
        i++;
    }

    tokens.push(new Token("EOL", "EOL"));
    return tokens;
}

// ──────────────────────────────────────────────────────────────
//  Expression parser  (Pratt / recursive-descent)
//  Returns a JS expression string.
// ──────────────────────────────────────────────────────────────
class ExprParser {
    constructor(tokens, compiler) {
        this.tokens  = tokens;
        this.pos     = 0;
        this.compiler = compiler;
    }

    peek()  { return this.tokens[this.pos] ?? new Token("EOL","EOL"); }
    next()  { return this.tokens[this.pos++] ?? new Token("EOL","EOL"); }
    expect(val) {
        const t = this.next();
        if (t.value !== val) throw new Error(`Expected '${val}', got '${t.value}'`);
        return t;
    }
    check(val) { return this.peek().value === val; }
    checkType(type) { return this.peek().type === type; }
    atEnd() { return this.peek().type === "EOL"; }

    // ── parse a full expression (lowest precedence: OR) ────────
    parse() { return this.parseOr(); }

    parseOr() {
        let left = this.parseAnd();
        while ((this.check("OR") && this.peek().type === "KW") || (this.check("||") && this.peek().type === "OP")) {
            this.next();
            left = `(${left} || ${this.parseAnd()})`;
        }
        return left;
    }

    parseAnd() {
        let left = this.parseNot();
        while ((this.check("AND") && this.peek().type === "KW") || (this.check("&&") && this.peek().type === "OP")) {
            this.next();
            left = `(${left} && ${this.parseNot()})`;
        }
        return left;
    }

    parseNot() {
        if ((this.check("NOT") && this.peek().type === "KW") ||
            (this.check("!") && this.peek().type === "OP")) {
            this.next();
            return `(!${this.parseNot()})`;
        }
        return this.parseComparison();
    }

    parseComparison() {
        let left = this.parseAddSub();
        const cmpOps = new Set(["<","<=",">",">=","==","!=","="]);
        while (this.peek().type === "OP" && cmpOps.has(this.peek().value)) {
            const op = this.next().value;
            const jsOp = op === "=" ? "===" : op === "!=" ? "!==" : op;
            left = `(${left} ${jsOp} ${this.parseAddSub()})`;
        }
        return left;
    }

    parseAddSub() {
        let left = this.parseMulDiv();
        while ((this.check("+") || this.check("-")) && this.peek().type === "OP") {
            const op = this.next().value;
            const right = this.parseMulDiv();
            if (op === "+") left = `(__woplAdd(${left}, ${right}))`;
            else            left = `(${left} - ${right})`;
        }
        return left;
    }

    parseMulDiv() {
        let left = this.parsePow();
        while ((this.check("*") || this.check("/") || this.check("%")) && this.peek().type === "OP") {
            const op = this.next().value;
            left = `(${left} ${op} ${this.parsePow()})`;
        }
        return left;
    }

    parsePow() {
        let left = this.parseUnary();
        if ((this.check("**") || this.check("^")) && this.peek().type === "OP") {
            this.next();
            left = `Math.pow(${left}, ${this.parsePow()})`;
        }
        return left;
    }

    parseUnary() {
        if (this.check("-") && this.peek().type === "OP") {
            this.next();
            return `(-(${this.parseUnary()}))`;
        }
        return this.parsePostfix();
    }

    // handles  expr.method(args)  and  expr[index]
    parsePostfix() {
        let left = this.parsePrimary();

        while (true) {
            if (this.check(".") && this.peek().type === "PUNCT") {
                this.next(); // consume '.'
                const member = this.next(); // method/field name — use raw (original case)
                const memberName = member.raw ?? member.value;
                if (this.check("(") && this.peek().type === "PUNCT") {
                    this.next(); // consume '('
                    const args = this.parseArgList(")");
                    this.expect(")");
                    // All class methods are async — use await so callers get the resolved value.
                    // Built-in WOPLString/WOPLArray methods are NOT async (they're synchronous),
                    // so we detect them: if the object is a known WOPL builtin method we skip await.
                    // Strategy: always emit await — sync methods return non-Promise values and
                    // `await nonPromise` is a no-op in JS, so this is safe and universal.
                    left = `(await ${left}.${memberName}(${args}))`;
                } else {
                    // field access — lowercase if it was a KW like LENGTH
                    const fieldName = member.type === "KW" ? memberName.toLowerCase() : memberName;
                    left = `${left}.${fieldName}`;
                }
            } else if (this.check("[") && this.peek().type === "PUNCT") {
                this.next();
                const idx = this.parse();
                this.expect("]");
                left = `(await ${left}.get(${idx}))`;
            } else {
                break;
            }
        }

        return left;
    }

    parseArgList(closingPunct) {
        const args = [];
        while (!this.check(closingPunct) && !this.atEnd()) {
            args.push(this.parse());
            if (this.check(",")) this.next();
        }
        return args.join(", ");
    }

    parsePrimary() {
        const t = this.peek();

        // grouped expression
        if (t.type === "PUNCT" && t.value === "(") {
            this.next();
            const inner = this.parse();
            this.expect(")");
            return inner;
        }

        // literals
        if (t.type === "NUMBER") { this.next(); return String(t.value); }
        if (t.type === "BOOL")   { this.next(); return String(t.value); }
        if (t.type === "NULL")   { this.next(); return "null"; }
        if (t.type === "STRING") {
            this.next();
            return `new WOPLString(${JSON.stringify(t.value)})`;
        }

        // TRUE / FALSE (caught as KW above just in case)
        if (t.type === "KW" && t.value === "TRUE")  { this.next(); return "true"; }
        if (t.type === "KW" && t.value === "FALSE") { this.next(); return "false"; }
        if (t.type === "KW" && t.value === "NULL")  { this.next(); return "null"; }

        // LIST literal  LIST 1, 2, 3  or just LIST
        if (t.type === "KW" && t.value === "LIST") {
            this.next();
            const items = [];
            while (!this.atEnd() && !this.check(")") && !this.check("]") && !this.check(",")) {
                items.push(this.parse());
                if (this.check(",")) { this.next(); } else break;
            }
            return `new WOPLArray([${items.join(", ")}])`;
        }

        // ARRAY( items, ... )  —  explicit constructor syntax
        if (t.type === "KW" && t.value === "ARRAY") {
            this.next();
            if (this.check("(")) {
                this.next();
                const args = this.parseArgList(")");
                this.expect(")");
                return `new WOPLArray([${args}])`;
            }
            return "new WOPLArray([])";
        }

        // STRING( val )  — explicit constructor
        if (t.type === "KW" && t.value === "STRING") {
            this.next();
            if (this.check("(")) {
                this.next();
                const arg = this.parse();
                this.expect(")");
                return `new WOPLString(woplStr(${arg}))`;
            }
            return 'new WOPLString("")';
        }

        // NEW ClassName(args)
        if (t.type === "KW" && t.value === "NEW") {
            this.next();
            const cls = this.next().value;
            if (this.check("(")) {
                this.next();
                const args = this.parseArgList(")");
                this.expect(")");
                return `new ${cls}(${args})`;
            }
            return `new ${cls}()`;
        }

        // built-in functions
        const builtins = {
            RAND:  (args) => `wplenv.rand(${args})`,
            FPTOI: (args) => `wplenv.fptoi(${args})`,
            ABS:   (args) => `Math.abs(${args})`,
            SQRT:  (args) => `Math.sqrt(${args})`,
            SIN:   (args) => `Math.sin(${args})`,
            COS:   (args) => `Math.cos(${args})`,
            LENGTH:(args) => `(${args}).length`,
            ISDOWN:(args) => `wplenv.isKeyDown(${args})`,
            GETUNIX:(args) => `wplenv.getUnixTimestamp()`,
            GETUNIXMS:(args) => `wplenv.getUnixMSTimestamp()`,
            GETDATE:(args) => `wplenv.getCurrentDate()`,
            GETTIME:(args) => `wplenv.getCurrentTime()`,
            INSTANCEOF: (args) => {
                const parts = args.split(",");
                return `(${parts[0].trim()} instanceof ${parts[1].trim()})`;
            },
        };

        if (t.type === "KW" && builtins[t.value]) {
            const fn = builtins[t.value];
            this.next();
            this.expect("(");
            const args = this.parseArgList(")");
            this.expect(")");
            return fn(args);
        }

        // MOUSEPOS keyword
        if (t.type === "KW" && t.value === "MOUSEPOS") {
            this.next();
            return `new WOPLArray(Object.values(Modules.gfx.getMousePos()))`;
        }
        if (t.type === "KW" && t.value === "GUSED") {
            this.next();
            return `Modules.gfx.isUsed()`;
        }

        // CALL FnName WITH arg1, arg2
        if (t.type === "KW" && t.value === "CALL") {
            this.next();
            const fn = this.next().value;
            let args = "";
            if (this.check("WITH") && this.peek().type === "KW") {
                this.next();
                const argTokens = [];
                while (!this.atEnd()) {
                    argTokens.push(this.parse());
                    if (this.check(",")) { this.next(); } else break;
                }
                args = argTokens.join(", ");
            }
            return `(await ${fn}(${args}))`;
        }

        // identifier → could be a function call
        if (t.type === "IDENT") {
            this.next();
            if (this.check("(") && this.peek().type === "PUNCT") {
                this.next();
                const args = this.parseArgList(")");
                this.expect(")");
                const isUserFn = this.compiler.functions.has(t.value);
                if (isUserFn) return `(await ${t.value}(${args}))`;
                return `${t.value}(${args})`;
            }
            return t.value;
        }

        // unknown keyword used as identifier (e.g. SUPER)
        if (t.type === "KW") {
            this.next();
            return t.value;
        }

        this.next();
        return "undefined";
    }
}

// helper added at runtime for string + number coercion
const WOPL_ADD_HELPER = `
function __woplAdd(a, b) {
    if (a instanceof WOPLString || b instanceof WOPLString)
        return new WOPLString(woplStr(a) + woplStr(b));
    return a + b;
}
`;

// ──────────────────────────────────────────────────────────────
//  Main compiler class
// ──────────────────────────────────────────────────────────────
class WOPLCOMPJS {
    constructor() {
        this.reset();
    }

    reset() {
        this.indentLevel    = 0;
        this.scopeStack     = [new Set()];
        this.functions      = new Set();
        this.classes        = new Set();
        this.inClass        = null;
        this.inMethod       = false;
        this.currentParent  = null;
        this._needsAutoSuper = false;
    }

    // ── scope helpers ─────────────────────────────────────────────
    _currentScope()        { return this.scopeStack[this.scopeStack.length - 1]; }
    _pushScope()           { this.scopeStack.push(new Set()); }
    _popScope()            { if (this.scopeStack.length > 1) this.scopeStack.pop(); }
    _isDeclared(name) {
        // search from innermost scope outward
        for (let k = this.scopeStack.length - 1; k >= 0; k--) {
            if (this.scopeStack[k].has(name)) return true;
        }
        return false;
    }
    _declare(name)         { this._currentScope().add(name); }

    indent() { return "    ".repeat(this.indentLevel); }

    // ── parse expression from a token array starting at `start` ──
    parseExpr(tokens, start = 0) {
        // always ensure there is an EOL sentinel
        const relevant = tokens.slice(start);
        if (!relevant.length || relevant[relevant.length-1]?.type !== "EOL") {
            relevant.push(new Token("EOL", "EOL"));
        }
        const parser = new ExprParser(relevant, this);
        return parser.parse();
    }

    // shortcut: parse expression from raw string
    exprFromStr(str) {
        const tokens = tokeniseLine(str);
        return this.parseExpr(tokens);
    }

    indentModule(code, times) {
        const indentStr = this.indent().repeat(times); // or use this.indent() if you want
        return code
            .split("\n")
            .map(line => line.trim() ? indentStr + line : line) // don't indent empty lines
            .join("\n");
    }


    async compileImportedModule(modulePath) {
        try {
            // Read the module file using your existing environment
            let readResult = await wplenv.readFile(modulePath + (modulePath.endsWith(".wpl") ? "" : ".wpl"));
            
            // check if module in default moduel dir (/wpl/*.wpl) from root
            if (!readResult) {
                readResult = await wplenv.readFile("/" + modulePath + (modulePath.endsWith(".wpl") ? "" : ".wpl"));
            }

            if (!readResult) {
                wplenv.outputToTerminalImmediately(`Module not found: ${modulePath}.wpl`);
                // throw new Error(`Module not found: ${modulePath}.wpl`);
            }

            const sourceCode = readResult.split("\n").slice(1).join("\n");;
            console.log(sourceCode);

            // Use a fresh compiler instance for the module
            const moduleCompiler = new WOPLCOMPJS();
            
            // Compile the module
            //console.log(`[IMPORT] Compiling module: ${modulePath}.wpl`);
            let moduleJS = await moduleCompiler.compile(sourceCode, true);
            //console.log(moduleJS.functions);
            moduleCompiler.functions.forEach(func => this.functions.add(func)); // add imported functions to main compiler's function set
            moduleCompiler.classes.forEach(cls => this.classes.add(cls)); // add imported classes to main compiler's class set
            //console.log(`[IMPORT] Compiled JS for module ${modulePath}:\n${moduleJS}`);

            // Add it where IMPORT <module> was
            let wrapped = `// === Module: ${modulePath} ===\n`;
            wrapped += `// All declarations from ${modulePath}.wpl will be attached here\n\n`;
            wrapped += moduleJS + "\n\n";           // insert the compiled code

            return wrapped;

        } catch (err) {
            console.error(`[IMPORT ERROR] ${modulePath}:`, err.message);
            wplenv.outputToTerminalImmediately(`Failed to import module "${modulePath}": ${err.message}`, "red");
        }
    }

    // ── compile ───────────────────────────────────────────────────
    async compile(code, isModule=false) {
        this.reset();

        const lines = code.split("\n");
        let js = ""
        if(!isModule){
            js += "return (async () => {\n" + WOPL_RUNTIME + "\n" + WOPL_ADD_HELPER + "\n";
            // make arguments ready
            js += "args = new WOPLArray(args)\nargc = args.length\n";
            this.indentLevel = 1;
        }

        let i = 0;
        while (i < lines.length) {
            const rawLine = lines[i];
            const line    = rawLine.trim();
            i++;

            if (!line || line.startsWith("#")) continue;

            const tokens  = tokeniseLine(line);
            const firstKW = tokens[0]?.value;

            // ── CLASS ───────────────────────────────────────────
            if (firstKW === "CLASS") {
                const name = tokens[1].value;
                this.classes.add(name);
                this.inClass = name;
                this.currentParent = null;
                let parentStr = "";
                if (tokens[2]?.value === "EXTENDS") {
                    this.currentParent = tokens[3].value;
                    parentStr = ` extends ${tokens[3].value}`;
                }
                js += `${this.indent()}class ${name}${parentStr} {\n`;
                this._pushScope();
                this.indentLevel++;
                continue;
            }

            // ── END CLASS / END METHOD ──────────────────────────
            if (firstKW === "END" && tokens[1]?.value === "CLASS") {
                this._popScope();
                this.indentLevel--;
                js += `${this.indent()}}\n`;
                this.inClass = null;
                this.currentParent = null;
                continue;
            }

            // ── METHOD ──────────────────────────────────────────
            if (firstKW === "METHOD") {
                // Use raw (original case) for method name to avoid KW uppercasing (e.g. "set" → "SET")
                const name = tokens[1].raw ?? tokens[1].value;
                let params = [];
                let idx = 2;
                if (tokens[idx]?.value === "PARAM") {
                    idx++;
                    while (tokens[idx] && tokens[idx].value !== "START" && tokens[idx].type !== "EOL") {
                        if (tokens[idx].type === "IDENT" || tokens[idx].type === "KW")
                            params.push(tokens[idx].raw ?? tokens[idx].value);
                        idx++;
                        if (tokens[idx]?.value === ",") idx++;
                    }
                }
                const methodName = (name === "INIT") ? "constructor" : name;
                // Methods are async so user-defined function calls (which use await) work inside them.
                // Constructors cannot be async in JS — calls to async user functions inside INIT
                // will still work as fire-and-forget; for most WOPL use cases this is fine.
                const asyncPrefix = (methodName === "constructor") ? "" : "async ";
                js += `${this.indent()}${asyncPrefix}${methodName}(${params.join(", ")}) {\n`;
                this._pushScope();
                params.forEach(p => this._declare(p));
                this.indentLevel++;
                // Auto-inject super() at the top of derived class constructors
                // so JS doesn't throw before `this` is accessible via FIELD assignments.
                // The user can still write SUPER(...) explicitly to pass args — we detect
                // that by peeking ahead in the source; but since we compile line-by-line
                // we just always emit super() here for derived classes, and if the user
                // writes SUPER(...) we suppress the auto-one via a flag.
                this._needsAutoSuper = (methodName === "constructor" && !!this.currentParent);
                this.inMethod = true;
                continue;
            }

            // ── END METHOD ──────────────────────────────────────
            if (firstKW === "END" && tokens[1]?.value === "METHOD") {
                this._popScope();
                this.indentLevel--;
                js += `${this.indent()}}\n`;
                this.inMethod = false;
                this._needsAutoSuper = false;
                continue;
            }

            // ── FIELD ───────────────────────────────────────────
            if (firstKW === "FIELD") {
                // Emit pending auto-super before first `this` access
                if (this._needsAutoSuper) {
                    js += `${this.indent()}super();\n`;
                    this._needsAutoSuper = false;
                }
                // Use raw (original case) so field names like "step" aren't uppercased to "STEP"
                const name = tokens[1].raw ?? tokens[1].value;
                if (tokens[2]?.value === "=") {
                    const expr = this.parseExpr(tokens, 3);
                    js += `${this.indent()}this.${name} = ${expr};\n`;
                } else {
                    js += `${this.indent()}this.${name} = null;\n`;
                }
                continue;
            }

            // ── FUNCTION ────────────────────────────────────────
            if (firstKW === "FUNCTION") {
                const name   = tokens[1].value;
                let params   = [];
                let idx      = 2;
                if (tokens[idx]?.value === "PARAM") {
                    idx++;
                    while (tokens[idx] && tokens[idx].value !== "START" && tokens[idx].type !== "EOL") {
                        if (tokens[idx].type === "IDENT") params.push(tokens[idx].value);
                        idx++;
                        if (tokens[idx]?.value === ",") idx++;
                    }
                }
                this.functions.add(name);
                js += `${this.indent()}async function ${name}(${params.join(", ")}) {\n`;
                this._pushScope();
                params.forEach(p => this._declare(p));
                this.indentLevel++;
                continue;
            }

            // ── END (generic) ────────────────────────────────────
            if (firstKW === "END") {
                this._popScope();
                this.indentLevel--;
                js += `${this.indent()}}\n`;
                continue;
            }

            // ── RETURN ──────────────────────────────────────────
            if (firstKW === "RETURN") {
                const expr = this.parseExpr(tokens, 1);
                js += `${this.indent()}return ${expr};\n`;
                continue;
            }

            // ── IF / ELSEIF / ELSE ───────────────────────────────
            if (firstKW === "IF") {
                // collect tokens between IF and THEN
                const thenIdx = tokens.findIndex(t => t.value === "THEN");
                const cond    = this.parseExpr(tokens.slice(1, thenIdx < 0 ? undefined : thenIdx));
                js += `${this.indent()}if (${cond}) {\n`;
                this._pushScope();
                this.indentLevel++;
                continue;
            }

            if (firstKW === "ELSEIF") {
                const thenIdx = tokens.findIndex(t => t.value === "THEN");
                const cond    = this.parseExpr(tokens.slice(1, thenIdx < 0 ? undefined : thenIdx));
                this._popScope();
                this.indentLevel--;
                js += `${this.indent()}} else if (${cond}) {\n`;
                this._pushScope();
                this.indentLevel++;
                continue;
            }

            if (firstKW === "ELSE") {
                this._popScope();
                this.indentLevel--;
                js += `${this.indent()}} else {\n`;
                this._pushScope();
                this.indentLevel++;
                continue;
            }

            // ── WHILE ────────────────────────────────────────────
            if (firstKW === "WHILE") {
                const startIdx = tokens.findIndex(t => t.value === "START");
                const cond     = this.parseExpr(tokens.slice(1, startIdx < 0 ? undefined : startIdx));
                js += `${this.indent()}while (${cond}) {\n`;
                this._pushScope();
                this.indentLevel++;
                continue;
            }

            // ── ITER ─────────────────────────────────────────────
            if (firstKW === "ITER") {
                // ITER <start> TO <end> [STEP <step>] WITH <var>
                let idx = 1;
                const startExprTokens = [];
                while (tokens[idx] && tokens[idx].value !== "TO") startExprTokens.push(tokens[idx++]);
                idx++; // skip TO
                const endExprTokens = [];
                while (tokens[idx] && tokens[idx].value !== "STEP" && tokens[idx].value !== "WITH") endExprTokens.push(tokens[idx++]);

                let stepExpr = "1";
                if (tokens[idx]?.value === "STEP") {
                    idx++;
                    const stepToks = [];
                    while (tokens[idx] && tokens[idx].value !== "WITH") stepToks.push(tokens[idx++]);
                    stepExpr = this.parseExpr(stepToks);
                }

                idx++; // skip WITH
                const varName  = tokens[idx].value;
                const startExpr = this.parseExpr(startExprTokens);
                const endExpr   = this.parseExpr(endExprTokens);

                const dir = stepExpr.trim().startsWith("-") ? ">=" : "<=";
                js += `${this.indent()}for (let ${varName} = ${startExpr}; ${varName} ${dir} ${endExpr}; ${varName} += ${stepExpr}) {\n`;
                this._pushScope();
                this._declare(varName);  // loop var is scoped to the loop
                this.indentLevel++;
                continue;
            }

            // ── FOREACH (iterate over array) ─────────────────────
            // FOREACH item IN arrayVar
            if (firstKW === "FOREACH") {
                const itemVar = tokens[1].value;
                // skip IN
                const arrExpr = this.parseExpr(tokens, 3);
                js += `${this.indent()}for (let ${itemVar} of ${arrExpr}) {\n`;
                this._pushScope();
                this._declare(itemVar);
                this.indentLevel++;
                continue;
            }

            // ── LET x = EXEC cmd  (must come before plain LET) ──
            if (firstKW === "LET" && tokens.some(t => t.value === "EXEC")) {
                const name    = tokens[1].value;
                const execIdx = tokens.findIndex(t => t.value === "EXEC");
                // everything after EXEC is the raw command (preserve original spacing)
                const cmd     = tokens.slice(execIdx + 1).filter(t => t.type !== "EOL").map(t => t.raw).join(" ");
                if (this._isDeclared(name)) {
                    js += `${this.indent()}${name} = await wplenv.execCmd(\`${cmd}\`);\n`;
                } else {
                    js += `${this.indent()}let ${name} = await wplenv.execCmd(\`${cmd}\`);\n`;
                    this._declare(name);
                }
                continue;
            }

            // ── LET x = INPUT "name: " (must come before plain LET) ──
            if (firstKW === "LET" && tokens.some(t => t.value === "INPUT")) {
                const name = tokens[1].value;
                const inputIdx = tokens.findIndex(t => t.value === "INPUT");

                let promptExpr = '""';  // default = no prompt

                // If there is anything after INPUT, treat it as the prompt
                if (inputIdx + 1 < tokens.length - 1) {
                    const promptTokens = tokens.slice(inputIdx + 1);
                    promptExpr = this._parsePrintExpr(promptTokens);
                }

                if (this._isDeclared(name)) {
                    js += `${this.indent()}${name} = await wplenv.waitForUserInput(woplStr(${promptExpr}));\n`;
                } else {
                    js += `${this.indent()}let ${name} = await wplenv.waitForUserInput(woplStr(${promptExpr}));\n`;
                    this._declare(name);
                }
                continue;
            }

            // ── LET x = expr ─────────────────────────────────────
            if (firstKW === "LET") {
                const name = tokens[1].value;
                // skip '='
                const expr = this.parseExpr(tokens, 3);
                if (this._isDeclared(name)) {
                    js += `${this.indent()}${name} = ${expr};\n`;
                } else {
                    js += `${this.indent()}let ${name} = ${expr};\n`;
                    this._declare(name);
                }
                continue;
            }

            // ── this.field = expr  (field reassignment without FIELD kw) ──
            // tokens: IDENT:this  PUNCT:.  IDENT-or-KW:fieldName  OP:...
            if (tokens[0]?.type === "IDENT" && tokens[0]?.value === "this" &&
                tokens[1]?.value === "." && tokens[1]?.type === "PUNCT" &&
                (tokens[2]?.type === "IDENT" || tokens[2]?.type === "KW")) {
                const field  = tokens[2].raw ?? tokens[2].value;  // preserve original case
                const op     = tokens[3]?.value;
                const opType = tokens[3]?.type;

                // this.x = expr
                if (op === "=" && opType === "OP") {
                    const expr = this.parseExpr(tokens, 4);
                    js += `${this.indent()}this.${field} = ${expr};\n`;
                    continue;
                }
                // this.x += expr  this.x -= expr  etc.
                if (opType === "OP" && ["+=","-=","*=","/="].includes(op)) {
                    const expr = this.parseExpr(tokens, 4);
                    if (op === "+=") {
                        js += `${this.indent()}this.${field} = __woplAdd(this.${field}, ${expr});\n`;
                    } else {
                        js += `${this.indent()}this.${field} ${op} ${expr};\n`;
                    }
                    continue;
                }
                // this.x++  this.x--
                if (opType === "OP" && (op === "++" || op === "--")) {
                    js += `${this.indent()}this.${field}${op};\n`;
                    continue;
                }
            }

            // ── Bare reassignment:  x = expr  ────────────────────
            // (IDENT followed by plain '=', not '==')
            if (tokens[0]?.type === "IDENT" && tokens[1]?.value === "=" && tokens[1]?.type === "OP") {
                const name = tokens[0].value;
                const expr = this.parseExpr(tokens, 2);
                if (this._isDeclared(name)) {
                    js += `${this.indent()}${name} = ${expr};\n`;
                } else {
                    // auto-declare in current scope (implicit declaration)
                    js += `${this.indent()}let ${name} = ${expr};\n`;
                    this._declare(name);
                }
                continue;
            }

            // ── Compound assignment:  x += expr  x -= expr  etc. ─
            if (tokens[0]?.type === "IDENT" &&
                tokens[1]?.type === "OP" &&
                ["+=","-=","*=","/="].includes(tokens[1]?.value)) {
                const name = tokens[0].value;
                const op   = tokens[1].value;
                const expr = this.parseExpr(tokens, 2);
                if (!this._isDeclared(name)) {
                    // auto-declare initialised to 0
                    js += `${this.indent()}let ${name} = 0;\n`;
                    this._declare(name);
                }
                if (op === "+=") {
                    // use __woplAdd so string concatenation works
                    js += `${this.indent()}${name} = __woplAdd(${name}, ${expr});\n`;
                } else {
                    js += `${this.indent()}${name} ${op} ${expr};\n`;
                }
                continue;
            }

            // ── Increment / decrement:  x++  x-- ─────────────────
            if (tokens[0]?.type === "IDENT" && tokens[1]?.type === "OP" &&
                (tokens[1]?.value === "++" || tokens[1]?.value === "--")) {
                const name = tokens[0].value;
                const op   = tokens[1].value;
                if (!this._isDeclared(name)) {
                    js += `${this.indent()}let ${name} = 0;\n`;
                    this._declare(name);
                }
                js += `${this.indent()}${name}${op};\n`;
                continue;
            }

            // ── SET ───────────────────────────────────────────────
            // SET arrName AT index TO value
            // SET obj.field TO value
            if (firstKW === "SET") {
                const target = tokens[1].value;

                // check for dot-access:  SET obj.field TO value
                if (tokens[2]?.value === ".") {
                    const field   = tokens[3].value;
                    const toIdx   = tokens.findIndex(t => t.value === "TO");
                    const val     = this.parseExpr(tokens, toIdx + 1);
                    js += `${this.indent()}${target}.${field} = ${val};\n`;
                    continue;
                }

                // SET arr AT index TO value
                const atIdx  = tokens.findIndex(t => t.value === "AT");
                const toIdx  = tokens.findIndex(t => t.value === "TO");
                const idx    = this.parseExpr(tokens.slice(atIdx + 1, toIdx));
                const val    = this.parseExpr(tokens, toIdx + 1);
                js += `${this.indent()}${target}.set(${idx}, ${val});\n`;
                continue;
            }

            // ── APPEND ────────────────────────────────────────────
            // APPEND val1, val2 TO arrName
            if (firstKW === "APPEND") {
                const toIdx = tokens.findIndex(t => t.value === "TO");
                const arr   = tokens[toIdx + 1].value;
                // parse comma-separated values between APPEND and TO
                const valTokens = tokens.slice(1, toIdx);
                // split on ',' tokens
                const groups = [];
                let cur = [];
                for (const tok of valTokens) {
                    if (tok.type === "PUNCT" && tok.value === ",") { groups.push(cur); cur = []; }
                    else if (tok.type !== "EOL") cur.push(tok);
                }
                if (cur.length) groups.push(cur);
                for (const g of groups) {
                    js += `${this.indent()}${arr}.push(${this.parseExpr(g)});\n`;
                }
                continue;
            }

            // ── REMOVE ───────────────────────────────────────────
            // REMOVE INDEX i FROM arr  |  REMOVE val FROM arr
            if (firstKW === "REMOVE") {
                if (tokens[1]?.value === "INDEX") {
                    const fromIdx = tokens.findIndex(t => t.value === "FROM");
                    const idx     = this.parseExpr(tokens.slice(2, fromIdx));
                    const arr     = tokens[fromIdx + 1].value;
                    js += `${this.indent()}${arr}.removeAt(${idx});\n`;
                } else {
                    const fromIdx = tokens.findIndex(t => t.value === "FROM");
                    const val     = this.parseExpr(tokens.slice(1, fromIdx));
                    const arr     = tokens[fromIdx + 1].value;
                    js += `${this.indent()}${arr}.remove(${val});\n`;
                }
                continue;
            }

            // ── PRINT ─────────────────────────────────────────────
            // PRINT now supports full expressions:  PRINT "Result: " + x
            // and old space-separated concat:        PRINT "Result: " x
            if (firstKW === "PRINT") {
                // Everything after PRINT is an expression (supporting '+' and implicit concat)
                // We allow the old space-separated form by inserting '+' between top-level tokens
                const printTokens = tokens.slice(1, tokens.findIndex(t => t.type === "EOL"));
                const expr        = this._parsePrintExpr(printTokens);
                js += `${this.indent()}{ const __pv = ${expr}; console.log(woplStr(__pv)); wplenv.outputToTerminalImmediately(woplStr(__pv)); }\n`;
                continue;
            }

            // ── IMPORT "module" ── // only available at current scope
            if (firstKW === "IMPORT") {
                let modulePath = line.trim().slice(7).trim(); // Remove "IMPORT " prefix
                //console.log(`[IMPORT] Attempting to import module: ${modulePath}`);

                // Remove quotes if present
                if (modulePath.startsWith('"') && modulePath.endsWith('"')) {
                    modulePath = modulePath.slice(1, -1);
                }
                console.log(`[IMPORT] Attempting to import module: ${modulePath}`);

                const importedCode = await this.compileImportedModule(modulePath);
                const indentedCode = this.indentModule(importedCode, this.indentLevel);

                // Prepend the imported module's compiled code
                js += "\n" + indentedCode + "\n";

                continue;
            }

            // ── EXEC cmd  (no assignment) ─────────────────────────
            if (firstKW === "EXEC") {
                const cmd = tokens.slice(1).filter(t => t.type !== "EOL").map(t => t.raw).join(" ");
                js += `${this.indent()}await wplenv.execCmd(\`${cmd}\`);\n`;
                continue;
            }

            // ── SLEEP ─────────────────────────────────────────────
            if (firstKW === "SLEEP") {
                const expr = this.parseExpr(tokens, 1);
                js += `${this.indent()}await new Promise(r => setTimeout(r, ${expr}));\n`;
                continue;
            }

            // ── BREAK / CONTINUE ─────────────────────────────────
            if (firstKW === "BREAK")    { js += `${this.indent()}break;\n`;    continue; }
            if (firstKW === "CONTINUE") { js += `${this.indent()}continue;\n`; continue; }

            // ── SUPER ────────────────────────────────────────────
            // SUPER(args)  — explicit super call; cancels any pending auto-super
            if (firstKW === "SUPER") {
                this._needsAutoSuper = false; // user is handling super explicitly
                // Build the call: SUPER(arg1, arg2) → super(arg1, arg2)
                if (tokens[1]?.value === "(" && tokens[1]?.type === "PUNCT") {
                    // parse arg list
                    const args = this._parseArgTokens(tokens, 2);
                    js += `${this.indent()}super(${args.join(", ")});\n`;
                } else {
                    js += `${this.indent()}super();\n`;
                }
                continue;
            }

            // ── GRAPHICS ─────────────────────────────────────────
            if (firstKW === "GINIT") {
                const args = this._parseArgTokens(tokens, 1);
                if (args.length >= 2) js += `${this.indent()}Modules.gfx.init(${args[0]}, ${args[1]});\n`;
                else                  js += `${this.indent()}Modules.gfx.init(800, 600);\n`;
                continue;
            }
            if (firstKW === "GCLOSE") { js += `${this.indent()}Modules.gfx.close();\n`; continue; }
            if (firstKW === "GCLEAR") {
                const args = this._parseArgTokens(tokens, 1);
                js += `${this.indent()}Modules.gfx.clear(${args[0] ?? '"#000000"'});\n`;
                continue;
            }
            if (firstKW === "GPIXEL") {
                const args = this._parseArgTokens(tokens, 1);
                js += `${this.indent()}Modules.gfx.drawPixel(${args[0]}, ${args[1]}, ${args[2] ?? '"#00ff00"'});\n`;
                continue;
            }
            if (firstKW === "GLINE") {
                const args = this._parseArgTokens(tokens, 1);
                js += `${this.indent()}Modules.gfx.drawLine(${args[0]}, ${args[1]}, ${args[2]}, ${args[3]}, ${args[4] ?? '"#00ff00"'}, ${args[5] ?? 1});\n`;
                continue;
            }
            if (firstKW === "GRECT") {
                const args = this._parseArgTokens(tokens, 1);
                js += `${this.indent()}Modules.gfx.drawRect(${args[0]}, ${args[1]}, ${args[2]}, ${args[3]}, ${args[4] ?? '"#00ff00"'}, ${args[5] ?? 1});\n`;
                continue;
            }
            if (firstKW === "GFRECT") {
                const args = this._parseArgTokens(tokens, 1);
                js += `${this.indent()}Modules.gfx.fillRect(${args[0]}, ${args[1]}, ${args[2]}, ${args[3]}, ${args[4] ?? '"#00ff00"'});\n`;
                continue;
            }
            if (firstKW === "GCIRCLE") {
                const args = this._parseArgTokens(tokens, 1);
                js += `${this.indent()}Modules.gfx.drawCircle(${args[0]}, ${args[1]}, ${args[2]}, ${args[3] ?? '"#00ff00"'}, ${args[4] ?? 1});\n`;
                continue;
            }
            if (firstKW === "GFCIRCLE") {
                const args = this._parseArgTokens(tokens, 1);
                js += `${this.indent()}Modules.gfx.fillCircle(${args[0]}, ${args[1]}, ${args[2]}, ${args[3] ?? '"#00ff00"'});\n`;
                continue;
            }
            if (firstKW === "GTEXT") {
                const args = this._parseArgTokens(tokens, 1);
                js += `${this.indent()}Modules.gfx.drawText(${args[0]}, ${args[1]}, woplStr(${args[2]}), woplStr(${args[3] ?? '"#00ff00"'}), ${args[4] ?? 16});\n`;
                continue;
            }

            // ── bare function / method call ───────────────────────
            // e.g.  MyFunc(x, y)  or  obj.method(x)
            {
                // reconstruct and try to parse as expression statement
                const expr = this.parseExpr(tokens, 0);
                // only emit if it looks like a call (contains parentheses in output)
                if (expr && expr !== "undefined") {
                    js += `${this.indent()}await Promise.resolve(${expr});\n`;
                    continue;
                }
            }

            js += `${this.indent()}// Unknown: ${line}\n`;
        }

        this.indentLevel = 0;
        if(!isModule){
            js += "})();\n";
        }
        return js;
    }

    // split comma-separated args (respecting parens) into expression strings
    _parseArgTokens(tokens, startIdx) {
        const argTokenGroups = [];
        let cur  = [];
        let depth = 0;
        for (let i = startIdx; i < tokens.length; i++) {
            const t = tokens[i];
            if (t.type === "EOL") break;
            if ((t.value === "(" || t.value === "[") && t.type === "PUNCT") { depth++; cur.push(t); continue; }
            if ((t.value === ")" || t.value === "]") && t.type === "PUNCT") { depth--; cur.push(t); continue; }
            if (t.value === "," && t.type === "PUNCT" && depth === 0) {
                argTokenGroups.push(cur); cur = []; continue;
            }
            cur.push(t);
        }
        if (cur.length) argTokenGroups.push(cur);
        return argTokenGroups.map(g => this.parseExpr(g));
    }

    // PRINT expression parser
    // Strategy: try parsing the whole token sequence as one expression.
    // If tokens remain after the first complete expression, we have space-separated
    // fragments (old-style "text" VAR concat) — join them all with woplStr()+woplStr().
    _parsePrintExpr(tokens) {
        const toks = tokens.filter(t => t.type !== "EOL");
        if (!toks.length) return '""';

        // Collect all top-level expression fragments separated by whitespace.
        // We do this by repeatedly parsing one expression and collecting the rest.
        const fragments = [];
        let pos = 0;

        while (pos < toks.length) {
            // build a sub-array from pos to end + EOL sentinel
            const sub = [...toks.slice(pos), new Token("EOL","EOL")];
            const parser = new ExprParser(sub, this);
            let result;
            try { result = parser.parse(); }
            catch { result = '""'; parser.pos = sub.length; }
            fragments.push(result);
            pos += parser.pos; // advance by how many tokens were consumed
            // skip any leftover EOL token in sub
        }

        if (fragments.length === 1) return fragments[0];
        return fragments.map(f => `woplStr(${f})`).join(' + ');
    }

    // kept for internal use (APPEND etc.) — not used by PRINT anymore
    _spaceConcat(tokens) {
        return this._parsePrintExpr(tokens);
    }
}


//let woplcompjs = new WOPLCOMPJS();
// test code
const ccode = `
LET A = 10
LET B = 20

FUNCTION Add PARAM A,B START
    RETURN A + B
END

LET X = CALL Add WITH 5,A
PRINT "Result: " X

IF X > 10 THEN
    PRINT "Big"
ELSE
    PRINT "Small"
END

ITER 1 TO 100 WITH I
    !PRINT "Loop: " I
    ITER 1 TO 20 WITH J
        PRINT "Loop: J: " J " I: " I
    END
END

LET I = 0
WHILE I < 5 START
    PRINT "While: " I
    LET I = I + 1
END

LET LST = LIST 1, 2, 3, 4, 5
SET LST AT 2 TO 99
LET LSTLEN = LENGTH LST
PRINT "Length: " LSTLEN
LET Y = LST AT 2
PRINT "Element at 2: " Y
LET Y = 5
PRINT Y
PRINT LST

`;

// run it
/*const js = woplcompjs.compile(ccode);
console.log(js);

// run it
new Function(js)();
*/

/*
// reimplementation of wpl with byte code compilation support:
// Bytecode Instruction Set
const OpCode = {
    // Stack operations
    PUSH: 0,          // Push literal value onto stack
    POP: 1,           // Pop value from stack
    LOAD: 2,          // Load variable onto stack
    STORE: 3,         // Store top of stack to variable
    
    // Arithmetic
    ADD: 10,
    SUB: 11,
    MUL: 12,
    DIV: 13,
    MOD: 14,
    
    // Comparison
    EQ: 20,
    NE: 21,
    LT: 22,
    LE: 23,
    GT: 24,
    GE: 25,
    
    // Logical
    AND: 30,
    OR: 31,
    NOT: 32,
    
    // Control flow
    JUMP: 40,         // Unconditional jump
    JUMP_IF_FALSE: 41,// Jump if top of stack is false
    JUMP_IF_TRUE: 42, // Jump if top of stack is true
    
    // Function calls
    CALL: 50,         // Call function
    RETURN: 51,       // Return from function
    
    // I/O
    PRINT: 60,
    INPUT: 61,
    
    // Lists
    LIST_NEW: 70,     // Create new list
    LIST_GET: 71,     // Get element at index
    LIST_SET: 72,     // Set element at index
    LIST_APPEND: 73,  // Append to list
    LIST_REMOVE: 74,  // Remove from list
    LIST_LEN: 75,     // Get list length
    LIST_FIND: 76,    // Find in list
    LIST_CONTAINS: 77,// Check if in list
    LIST_CLEAR: 78,   // Clear list
    
    // Graphics
    G_INIT: 80,
    G_CLOSE: 81,
    G_CLEAR: 82,
    G_PIXEL: 83,
    G_LINE: 84,
    G_RECT: 85,
    G_FRECT: 86,
    G_CIRCLE: 87,
    G_FCIRCLE: 88,
    G_TEXT: 89,
    G_USED: 90,
    
    // Special
    SLEEP: 100,
    EXEC: 101,
    ISDOWN: 102,
    
    // Loop control
    BREAK: 110,
    CONTINUE: 111,
    
    // End marker
    HALT: 255
};

// Bytecode Compiler
class BytecodeCompiler {
    constructor() {
        this.bytecode = [];
        this.constants = [];
        this.labels = new Map();
        this.functions = new Map();
        this.currentAddress = 0;
    }

    // Add constant to pool and return index
    addConstant(value) {
        const index = this.constants.indexOf(value);
        if (index !== -1) return index;
        this.constants.push(value);
        return this.constants.length - 1;
    }

    // Emit instruction
    emit(opcode, ...operands) {
        this.bytecode.push(opcode);
        for (const operand of operands) {
            this.bytecode.push(operand);
        }
        this.currentAddress = this.bytecode.length;
    }

    // Label management
    setLabel(name) {
        this.labels.set(name, this.currentAddress);
    }

    getLabel(name) {
        return this.labels.get(name);
    }

    // Create placeholder for forward jumps
    createPlaceholder() {
        const pos = this.currentAddress;
        this.emit(0); // Placeholder
        return pos;
    }

    patchPlaceholder(pos, value) {
        this.bytecode[pos] = value;
    }

    compile(code) {
        const lines = code.split("\n")
            .map(l => l.trim())
            .filter(l => l.length > 0 && !l.startsWith("//") && !l.startsWith("#"));

        try {
            this.compileBlock(lines, 0, lines.length);
            this.emit(OpCode.HALT);
            
            return {
                success: true,
                bytecode: this.bytecode,
                constants: this.constants,
                functions: Object.fromEntries(this.functions)
            };
        } catch (error) {
            return {
                success: false,
                error: error.message,
                line: error.line || 0
            };
        }
    }

    compileBlock(lines, start, end) {
        let i = start;
        
        while (i < end) {
            const line = lines[i];
            
            try {
                if (line.startsWith("LET ")) {
                    i = this.compileLet(lines, i);
                } else if (line.startsWith("PRINT ")) {
                    i = this.compilePrint(lines, i);
                } else if (line.startsWith("INPUT ")) {
                    i = this.compileInput(lines, i);
                } else if (line.startsWith("IF ")) {
                    i = this.compileIf(lines, i, end);
                } else if (line.startsWith("WHILE ")) {
                    i = this.compileWhile(lines, i, end);
                } else if (line.startsWith("ITER ")) {
                    i = this.compileIter(lines, i, end);
                } else if (line.startsWith("FUNCTION ")) {
                    i = this.compileFunction(lines, i, end);
                } else if (line.startsWith("CALL ")) {
                    i = this.compileCall(lines, i);
                } else if (line.startsWith("RETURN ")) {
                    i = this.compileReturn(lines, i);
                } else if (line.startsWith("BREAK")) {
                    this.emit(OpCode.BREAK);
                    i++;
                } else if (line.startsWith("CONTINUE")) {
                    this.emit(OpCode.CONTINUE);
                    i++;
                } else if (line.startsWith("APPEND ")) {
                    i = this.compileAppend(lines, i);
                } else if (line.startsWith("REMOVE ")) {
                    i = this.compileRemove(lines, i);
                } else if (line.startsWith("SET ") && line.includes(" AT ")) {
                    i = this.compileSetAt(lines, i);
                } else if (line.startsWith("CLEAR ")) {
                    i = this.compileClear(lines, i);
                } else if (line.startsWith("GINIT")) {
                    i = this.compileGInit(lines, i);
                } else if (line.startsWith("GCLOSE")) {
                    this.emit(OpCode.G_CLOSE);
                    i++;
                } else if (line.startsWith("GCLEAR")) {
                    i = this.compileGClear(lines, i);
                } else if (line.startsWith("GPIXEL ")) {
                    i = this.compileGPixel(lines, i);
                } else if (line.startsWith("GLINE ")) {
                    i = this.compileGLine(lines, i);
                } else if (line.startsWith("GRECT ")) {
                    i = this.compileGRect(lines, i);
                } else if (line.startsWith("GFRECT ")) {
                    i = this.compileGFRect(lines, i);
                } else if (line.startsWith("GCIRCLE ")) {
                    i = this.compileGCircle(lines, i);
                } else if (line.startsWith("GFCIRCLE ")) {
                    i = this.compileGFCircle(lines, i);
                } else if (line.startsWith("GTEXT ")) {
                    i = this.compileGText(lines, i);
                } else if (line.startsWith("SLEEP ")) {
                    i = this.compileSleep(lines, i);
                } else if (line.startsWith("EXEC ")) {
                    i = this.compileExec(lines, i);
                } else {
                    i++;
                }
            } catch (error) {
                error.line = i + 1;
                throw error;
            }
        }
        
        return i;
    }

    compileLet(lines, i) {
        const line = lines[i];
        const match = line.match(/LET\s+(\w+)\s*=\s*(.+)/);
        
        if (!match) {
            throw new Error(`Invalid LET syntax: ${line}`);
        }
        
        const varName = match[1];
        const expr = match[2];
        
        // Compile expression
        this.compileExpression(expr);
        
        // Store result
        const varIndex = this.addConstant(varName);
        this.emit(OpCode.STORE, varIndex);
        
        return i + 1;
    }

    compilePrint(lines, i) {
        const line = lines[i];
        const expr = line.substring(6);
        
        this.compileExpression(expr);
        this.emit(OpCode.PRINT);
        
        return i + 1;
    }

    compileInput(lines, i) {
        const line = lines[i];
        const match = line.match(/INPUT\s+(.+)/);
        
        if (match && match[1]) {
            this.compileExpression(match[1]);
        } else {
            const emptyStr = this.addConstant("");
            this.emit(OpCode.PUSH, emptyStr);
        }
        
        this.emit(OpCode.INPUT);
        
        return i + 1;
    }

    compileIf(lines, start, blockEnd) {
        const line = lines[start];
        const condPart = line.replace(/^IF\s+/, "").replace(/\s+THEN$/, "");
        
        // Compile condition
        this.compileExpression(condPart);
        
        // Jump if false placeholder
        const jumpIfFalsePos = this.currentAddress;
        this.emit(OpCode.JUMP_IF_FALSE, 0);
        
        // Find blocks
        let i = start + 1;
        let depth = 0;
        let elseStart = -1;
        let blockEndPos = blockEnd;
        
        while (i < blockEnd) {
            const l = lines[i];
            
            if (l.startsWith("IF ") || l.startsWith("WHILE ") || l.startsWith("ITER ")) {
                depth++;
            }
            
            if (l === "END") {
                if (depth > 0) {
                    depth--;
                } else {
                    blockEndPos = i;
                    break;
                }
            }
            
            if (l === "ELSE" && depth === 0) {
                elseStart = i;
            }
            
            i++;
        }
        
        // Compile THEN block
        const thenEnd = elseStart !== -1 ? elseStart : blockEndPos;
        this.compileBlock(lines, start + 1, thenEnd);
        
        if (elseStart !== -1) {
            // Jump over ELSE block
            const jumpOverElsePos = this.currentAddress;
            this.emit(OpCode.JUMP, 0);
            
            // Patch JUMP_IF_FALSE to jump here
            this.patchPlaceholder(jumpIfFalsePos + 1, this.currentAddress);
            
            // Compile ELSE block
            this.compileBlock(lines, elseStart + 1, blockEndPos);
            
            // Patch jump over else
            this.patchPlaceholder(jumpOverElsePos + 1, this.currentAddress);
        } else {
            // No ELSE, patch JUMP_IF_FALSE to jump to end
            this.patchPlaceholder(jumpIfFalsePos + 1, this.currentAddress);
        }
        
        return blockEndPos + 1;
    }

    compileWhile(lines, start, blockEnd) {
        const line = lines[start];
        const condPart = line.replace(/^WHILE\s+/, "").replace(/\s+START$/, "");
        
        // Mark loop start
        const loopStart = this.currentAddress;
        
        // Compile condition
        this.compileExpression(condPart);
        
        // Jump if false (exit loop)
        const exitJumpPos = this.currentAddress;
        this.emit(OpCode.JUMP_IF_FALSE, 0);
        
        // Find loop end
        let i = start + 1;
        let depth = 0;
        let loopEnd = blockEnd;
        
        while (i < blockEnd) {
            const l = lines[i];
            
            if (l.startsWith("WHILE ") || l.startsWith("IF ") || l.startsWith("ITER ")) {
                depth++;
            }
            
            if (l === "END") {
                if (depth > 0) {
                    depth--;
                } else {
                    loopEnd = i;
                    break;
                }
            }
            
            i++;
        }
        
        // Compile loop body
        this.compileBlock(lines, start + 1, loopEnd);
        
        // Jump back to condition
        this.emit(OpCode.JUMP, loopStart);
        
        // Patch exit jump
        this.patchPlaceholder(exitJumpPos + 1, this.currentAddress);
        
        return loopEnd + 1;
    }

    compileIter(lines, start, blockEnd) {
        const line = lines[start];
        const match = line.match(/^ITER\s+(.+?)\s+TO\s+(.+?)(?:\s+STEP\s+(.+?))?\s+WITH\s+(\w+)$/);
        
        if (!match) {
            throw new Error(`Invalid ITER syntax: ${line}`);
        }
        
        const iterStart = match[1];
        const iterEnd = match[2];
        const step = match[3] || "1";
        const iterator = match[4];
        
        // Initialize iterator
        this.compileExpression(iterStart);
        const iterVarIndex = this.addConstant(iterator);
        this.emit(OpCode.STORE, iterVarIndex);
        
        // Store end value and step in temp variables
        const endVarIndex = this.addConstant("__iter_end__");
        const stepVarIndex = this.addConstant("__iter_step__");
        
        this.compileExpression(iterEnd);
        this.emit(OpCode.STORE, endVarIndex);
        
        this.compileExpression(step);
        this.emit(OpCode.STORE, stepVarIndex);
        
        // Loop start
        const loopStart = this.currentAddress;
        
        // Check condition: iterator <= end (or >= if step negative)
        this.emit(OpCode.LOAD, iterVarIndex);
        this.emit(OpCode.LOAD, endVarIndex);
        this.emit(OpCode.LOAD, stepVarIndex);
        const stepConst = this.addConstant(0);
        this.emit(OpCode.PUSH, stepConst);
        this.emit(OpCode.GT); // step > 0?
        
        // If step > 0, use LE, else use GE
        const useLeJumpPos = this.currentAddress;
        this.emit(OpCode.JUMP_IF_FALSE, 0);
        
        // step > 0 branch
        this.emit(OpCode.LOAD, iterVarIndex);
        this.emit(OpCode.LOAD, endVarIndex);
        this.emit(OpCode.LE);
        const afterCondJumpPos = this.currentAddress;
        this.emit(OpCode.JUMP, 0);
        
        // step <= 0 branch
        this.patchPlaceholder(useLeJumpPos + 1, this.currentAddress);
        this.emit(OpCode.LOAD, iterVarIndex);
        this.emit(OpCode.LOAD, endVarIndex);
        this.emit(OpCode.GE);
        
        this.patchPlaceholder(afterCondJumpPos + 1, this.currentAddress);
        
        // Exit if condition false
        const exitJumpPos = this.currentAddress;
        this.emit(OpCode.JUMP_IF_FALSE, 0);
        
        // Find loop end
        let i = start + 1;
        let depth = 0;
        let loopEnd = blockEnd;
        
        while (i < blockEnd) {
            const l = lines[i];
            
            if (l.startsWith("ITER ") || l.startsWith("WHILE ") || l.startsWith("IF ")) {
                depth++;
            }
            
            if (l === "END") {
                if (depth > 0) {
                    depth--;
                } else {
                    loopEnd = i;
                    break;
                }
            }
            
            i++;
        }
        
        // Compile loop body
        this.compileBlock(lines, start + 1, loopEnd);
        
        // Increment iterator by step
        this.emit(OpCode.LOAD, iterVarIndex);
        this.emit(OpCode.LOAD, stepVarIndex);
        this.emit(OpCode.ADD);
        this.emit(OpCode.STORE, iterVarIndex);
        
        // Jump back
        this.emit(OpCode.JUMP, loopStart);
        
        // Patch exit
        this.patchPlaceholder(exitJumpPos + 1, this.currentAddress);
        
        return loopEnd + 1;
    }

    compileFunction(lines, start, blockEnd) {
        const header = lines[start];
        const match = header.match(/FUNCTION\s+(\w+)(?:\s+PARAM\s+(.+))?\s+START/);
        
        if (!match) {
            throw new Error(`Invalid FUNCTION syntax: ${header}`);
        }
        
        const name = match[1];
        const params = match[2] ? match[2].split(",").map(s => s.trim()) : [];
        
        // Find function end
        let i = start + 1;
        let depth = 0;
        let funcEnd = blockEnd;
        
        while (i < blockEnd) {
            const l = lines[i];
            
            if (l.startsWith("FUNCTION ") || l.startsWith("IF ") || l.startsWith("WHILE ") || l.startsWith("ITER ")) {
                depth++;
            }
            
            if (l === "END") {
                if (depth > 0) {
                    depth--;
                } else {
                    funcEnd = i;
                    break;
                }
            }
            
            i++;
        }
        
        // Store function metadata
        this.functions.set(name, {
            address: this.currentAddress,
            params: params,
            bodyStart: start + 1,
            bodyEnd: funcEnd
        });
        
        // Jump over function body (functions are only called, not executed in sequence)
        const skipFuncPos = this.currentAddress;
        this.emit(OpCode.JUMP, 0);
        
        // Mark function start
        this.setLabel(`func_${name}`);
        
        // Compile function body
        this.compileBlock(lines, start + 1, funcEnd);
        
        // Implicit return null
        const nullConst = this.addConstant(null);
        this.emit(OpCode.PUSH, nullConst);
        this.emit(OpCode.RETURN);
        
        // Patch skip jump
        this.patchPlaceholder(skipFuncPos + 1, this.currentAddress);
        
        return funcEnd + 1;
    }

    compileCall(lines, i) {
        const line = lines[i];
        const match = line.match(/CALL\s+(\w+)(?:\s+WITH\s+(.+))?/);
        
        if (!match) {
            throw new Error(`Invalid CALL syntax: ${line}`);
        }
        
        const funcName = match[1];
        const args = match[2] ? match[2].split(",").map(a => a.trim()) : [];
        
        // Push arguments onto stack (in order)
        for (const arg of args) {
            this.compileExpression(arg);
        }
        
        // Push argument count
        const argCount = this.addConstant(args.length);
        this.emit(OpCode.PUSH, argCount);
        
        // Call function
        const funcNameIndex = this.addConstant(funcName);
        this.emit(OpCode.CALL, funcNameIndex);
        
        return i + 1;
    }

    compileReturn(lines, i) {
        const line = lines[i];
        const expr = line.substring(7);
        
        this.compileExpression(expr);
        this.emit(OpCode.RETURN);
        
        return i + 1;
    }

    compileAppend(lines, i) {
        const line = lines[i];
        const match = line.match(/APPEND\s+(.+)\s+TO\s+(\w+)/);
        
        if (!match) {
            throw new Error(`Invalid APPEND syntax: ${line}`);
        }
        
        const values = match[1].split(",").map(v => v.trim());
        const listName = match[2];
        
        const listIndex = this.addConstant(listName);
        
        for (const value of values) {
            this.emit(OpCode.LOAD, listIndex);
            this.compileExpression(value);
            this.emit(OpCode.LIST_APPEND);
        }
        
        return i + 1;
    }

    compileRemove(lines, i) {
        const line = lines[i];
        const listNameMatch = line.match(/FROM\s+(\w+)/);
        
        if (!listNameMatch) {
            throw new Error(`Invalid REMOVE syntax: ${line}`);
        }
        
        const listIndex = this.addConstant(listNameMatch[1]);
        this.emit(OpCode.LOAD, listIndex);
        
        if (line.includes(" INDEX ")) {
            const match = line.match(/REMOVE\s+INDEX\s+(.+)\s+FROM/);
            this.compileExpression(match[1]);
            this.emit(OpCode.LIST_REMOVE);
        } else if (line.includes(" ALL ")) {
            const match = line.match(/REMOVE\s+ALL\s+(.+)\s+FROM/);
            this.compileExpression(match[1]);
            const trueConst = this.addConstant(true);
            this.emit(OpCode.PUSH, trueConst);
            this.emit(OpCode.LIST_REMOVE);
        } else {
            const match = line.match(/REMOVE\s+(.+)\s+FROM/);
            this.compileExpression(match[1]);
            const falseConst = this.addConstant(false);
            this.emit(OpCode.PUSH, falseConst);
            this.emit(OpCode.LIST_REMOVE);
        }
        
        return i + 1;
    }

    compileSetAt(lines, i) {
        const line = lines[i];
        const match = line.match(/SET\s+(\w+)\s+AT\s+(.+)\s+TO\s+(.+)/);
        
        if (!match) {
            throw new Error(`Invalid SET AT syntax: ${line}`);
        }
        
        const listIndex = this.addConstant(match[1]);
        this.emit(OpCode.LOAD, listIndex);
        this.compileExpression(match[2]);
        this.compileExpression(match[3]);
        this.emit(OpCode.LIST_SET);
        
        return i + 1;
    }

    compileClear(lines, i) {
        const line = lines[i];
        const match = line.match(/CLEAR\s+(\w+)/);
        
        if (!match) {
            throw new Error(`Invalid CLEAR syntax: ${line}`);
        }
        
        const listIndex = this.addConstant(match[1]);
        this.emit(OpCode.LOAD, listIndex);
        this.emit(OpCode.LIST_CLEAR);
        
        return i + 1;
    }

    compileGInit(lines, i) {
        const line = lines[i];
        const match = line.match(/GINIT(?:\s+(.+))?/);
        
        if (match && match[1]) {
            const args = this.parseCommaArgs(match[1]);
            if (args.length === 2) {
                this.compileExpression(args[0]);
                this.compileExpression(args[1]);
            } else {
                const w = this.addConstant(800);
                const h = this.addConstant(600);
                this.emit(OpCode.PUSH, w);
                this.emit(OpCode.PUSH, h);
            }
        } else {
            const w = this.addConstant(800);
            const h = this.addConstant(600);
            this.emit(OpCode.PUSH, w);
            this.emit(OpCode.PUSH, h);
        }
        
        this.emit(OpCode.G_INIT);
        return i + 1;
    }

    compileGClear(lines, i) {
        const line = lines[i];
        const match = line.match(/GCLEAR(?:\s+(.+))?/);
        
        if (match && match[1]) {
            this.compileExpression(match[1]);
        } else {
            const black = this.addConstant('#000000');
            this.emit(OpCode.PUSH, black);
        }
        
        this.emit(OpCode.G_CLEAR);
        return i + 1;
    }

    compileGPixel(lines, i) {
        const line = lines[i];
        const match = line.match(/GPIXEL\s+(.+)/);
        const args = this.parseCommaArgs(match[1]);
        
        this.compileExpression(args[0]);
        this.compileExpression(args[1]);
        
        if (args[2]) {
            this.compileExpression(args[2]);
        } else {
            const green = this.addConstant('#00ff00');
            this.emit(OpCode.PUSH, green);
        }
        
        this.emit(OpCode.G_PIXEL);
        return i + 1;
    }

    compileGLine(lines, i) {
        const line = lines[i];
        const match = line.match(/GLINE\s+(.+)/);
        const args = this.parseCommaArgs(match[1]);
        
        for (let j = 0; j < 4; j++) {
            this.compileExpression(args[j]);
        }
        
        if (args[4]) {
            this.compileExpression(args[4]);
        } else {
            const green = this.addConstant('#00ff00');
            this.emit(OpCode.PUSH, green);
        }
        
        if (args[5]) {
            this.compileExpression(args[5]);
        } else {
            const one = this.addConstant(1);
            this.emit(OpCode.PUSH, one);
        }
        
        this.emit(OpCode.G_LINE);
        return i + 1;
    }

    compileGRect(lines, i) {
        const line = lines[i];
        const match = line.match(/GRECT\s+(.+)/);
        const args = this.parseCommaArgs(match[1]);
        
        for (let j = 0; j < 4; j++) {
            this.compileExpression(args[j]);
        }
        
        if (args[4]) {
            this.compileExpression(args[4]);
        } else {
            const green = this.addConstant('#00ff00');
            this.emit(OpCode.PUSH, green);
        }
        
        if (args[5]) {
            this.compileExpression(args[5]);
        } else {
            const one = this.addConstant(1);
            this.emit(OpCode.PUSH, one);
        }
        
        this.emit(OpCode.G_RECT);
        return i + 1;
    }

    compileGFRect(lines, i) {
        const line = lines[i];
        const match = line.match(/GFRECT\s+(.+)/);
        const args = this.parseCommaArgs(match[1]);
        
        for (let j = 0; j < 4; j++) {
            this.compileExpression(args[j]);
        }
        
        if (args[4]) {
            this.compileExpression(args[4]);
        } else {
            const green = this.addConstant('#00ff00');
            this.emit(OpCode.PUSH, green);
        }
        
        this.emit(OpCode.G_FRECT);
        return i + 1;
    }

    compileGCircle(lines, i) {
        const line = lines[i];
        const match = line.match(/GCIRCLE\s+(.+)/);
        const args = this.parseCommaArgs(match[1]);
        
        for (let j = 0; j < 3; j++) {
            this.compileExpression(args[j]);
        }
        
        if (args[3]) {
            this.compileExpression(args[3]);
        } else {
            const green = this.addConstant('#00ff00');
            this.emit(OpCode.PUSH, green);
        }
        
        if (args[4]) {
            this.compileExpression(args[4]);
        } else {
            const one = this.addConstant(1);
            this.emit(OpCode.PUSH, one);
        }
        
        this.emit(OpCode.G_CIRCLE);
        return i + 1;
    }

    compileGFCircle(lines, i) {
        const line = lines[i];
        const match = line.match(/GFCIRCLE\s+(.+)/);
        const args = this.parseCommaArgs(match[1]);
        
        for (let j = 0; j < 3; j++) {
            this.compileExpression(args[j]);
        }
        
        if (args[3]) {
            this.compileExpression(args[3]);
        } else {
            const green = this.addConstant('#00ff00');
            this.emit(OpCode.PUSH, green);
        }
        
        this.emit(OpCode.G_FCIRCLE);
        return i + 1;
    }

    //compileGText(lines, i) {
    //    const line = lines[i];
    //    const match = line.match(/GTEXT\s+(.+)/);
    //    const args = this.parseCommaArgs(match[1]);
    //    
    //    for (


    // minimal version - may not work!

    addConst(val) {
        let i = this.constants.indexOf(val);
        if (i !== -1) return i;
        this.constants.push(val);
        return this.constants.length - 1;
    }

    compileExpression(expr) {
        expr = expr.trim();
        
        // String literal
        if ((expr[0] === '"' && expr[expr.length-1] === '"') ||
            (expr[0] === "'" && expr[expr.length-1] === "'")) {
            this.emit(OpCode.PUSH, this.addConst(expr.slice(1, -1)));
            return;
        }
        
        // Number
        if (!isNaN(expr)) {
            this.emit(OpCode.PUSH, this.addConst(expr.includes('.') ? parseFloat(expr) : parseInt(expr)));
            return;
        }
        
        // Boolean
        if (expr === 'true') { this.emit(OpCode.PUSH, this.addConst(true)); return; }
        if (expr === 'false') { this.emit(OpCode.PUSH, this.addConst(false)); return; }
        
        // Variable
        if (/^[A-Za-z_]\w*$/.test(expr)) {
            this.emit(OpCode.LOAD, this.addConst(expr));
            return;
        }
        
        // Binary operations
        for (let [op, code] of [['+', OpCode.ADD], ['-', OpCode.SUB], ['*', OpCode.MUL], ['/', OpCode.DIV],
                                 ['==', OpCode.EQ], ['!=', OpCode.NE], ['<', OpCode.LT], ['>', OpCode.GT]]) {
            let parts = this.splitOp(expr, op);
            if (parts.length === 2) {
                this.compileExpr(parts[0]);
                this.compileExpr(parts[1]);
                this.emit(code);
                return;
            }
        }
        
        // Fallback: push as constant
        this.emit(OpCode.PUSH, this.addConst(expr));
    }

}
*/


// store modules here
class Modules{
    static moduleNotLoaded = "Module not loaded yet! Use load command to load the required module.";
    static date = null;
    static random = null;
    static net = null;
    static wpl = null;
    static gfx = null;
}

// module loader
class Loader {
    // List of all modules to load/unload, including name and constructor
    static moduleList = [
        { name: "date", key: "date", classRef: DateUtils },
        { name: "random", key: "random", classRef: RandomUtils },
        { name: "net", key: "net", classRef: Network },
        { name: "oldwpl", key: "oldwpl", classRef: WebOSPLang },
        { name: "wpl", key: "wpl", classRef: WOPLCOMPJS },
        { name: "gfx", key: "gfx", classRef: Graphics },
        { name: "audio", key: "audio", classRef: AudioPlayer },
        { name: "ytplayer", key: "ytplayer", classRef: YTPlayer },
    ];

    static systemModules = ["fs"];

    static loadModule(moduleName) {
        console.log("Loading module: " + moduleName);

        if (this.systemModules.includes(moduleName)) {
            return ["", false, "System modules cannot be loaded!"];
        }

        const mod = this.moduleList.find(m => m.name === moduleName);
        if (!mod) {
            return ["", false, `Module not found: ${moduleName}`];
        }

        // dont allow loading module twice
        if (Modules[mod.key] != null) {
            return ["", false, "Module already loaded!"];
        }

        Modules[mod.key] = new mod.classRef();
        return ["", true, `Module loaded: ${moduleName}`];
    }

    static loadAllModules() {
        console.log("Loading all modules...");

        for (const mod of this.moduleList) {
            const output = this.loadModule(mod.name);
            if (!output[1]) return output;
        }

        return ["", true, "All modules loaded!"];
    }

    static unloadModule(moduleName) {
        console.log("Unloading module: " + moduleName);

        if (this.systemModules.includes(moduleName)) {
            if (filesystem != null) {
                filesystem = null;
                return ["", true, "System module unloaded: fs"];
            } else {
                return ["", false, "System module not loaded!"];
            }
        }

        const mod = this.moduleList.find(m => m.name === moduleName);
        if (!mod) {
            return ["", false, `Module not found: ${moduleName}`];
        }

        if (Modules[mod.key] != null) {
            Modules[mod.key] = null;
            return ["", true, `Module unloaded: ${moduleName}`];
        } else {
            return ["", false, "Module not loaded!"];
        }
    }

    static getLoadedModules() {
        const loaded = this.moduleList
            .filter(mod => Modules[mod.key] != null)
            .map(mod => mod.name);

        if (filesystem != null) {
            loaded.push("fs");
        }

        return loaded;
    }
    static getAllModules() {
        return this.moduleList.map(mod => mod.name).concat(this.systemModules);
    }
}

// need to be part of Crypt class later:
function utf8ToBase64(str) {
    const bytes = new TextEncoder().encode(str); // UTF-8 bytes
    let binary = '';
    for (let b of bytes) {
        binary += String.fromCharCode(b);
    }
    return btoa(binary);
}

function bytesToBase64(buffer) {
    const bytes = new Uint8Array(buffer);
    let binary = '';

    for (let i = 0; i < bytes.length; i++) {
        binary += String.fromCharCode(bytes[i]);
    }

    return btoa(binary);
}

function normalizeToBytes(input) {
    if (input instanceof Uint8Array) return input;
    if (input instanceof ArrayBuffer) return new Uint8Array(input);

    if (typeof input === "string") {
        // latin-1: treat each char as one byte (matches base64ToUtf8 above)
        const bytes = new Uint8Array(input.length);
        for (let i = 0; i < input.length; i++) {
            bytes[i] = input.charCodeAt(i) & 0xFF;
        }
        return bytes;
    }

    throw new Error("Unsupported data type");
}

/*function base64ToUtf8(base64) {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
    }
    return new TextDecoder().decode(bytes);
}*/

function base64ToUtf8(base64) {
    // Use base64ToBytes + latin-1 string (not TextDecoder which replaces invalid UTF-8)
    const bytes = base64ToBytes(base64);
    let str = '';
    for (let i = 0; i < bytes.length; i++) {
        str += String.fromCharCode(bytes[i]); // latin-1: preserves all byte values
    }
    return str;
}

function base64ToBytes(base64) {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);

    for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
    }

    return bytes; // ✅ raw bytes
}


/**
 * FS — Inode-based filesystem backed by IndexedDB
 *
 * Object stores:
 *   nodes   — inode → { type: "file"|"dir", content: Uint8Array (files only) }
 *   dentries— { parent: inode, name: string } → childInode   (keyPath compound)
 *   meta    — inode → { created, modified, permissions, owner, size, ... }
 *
 * Inode 0 is always the root directory.
 *
 * Public API is fully compatible with the original FS class.
 * Callers must await fs.ready before use.
 */
class FS {
    static ROOT_INODE = 0;

    protectedFiles = [[".filesystem"], ["help.txt"], ["tools"]];

    constructor() {
        this._db       = null;
        this._nextIno  = null; // loaded from meta store key "__nextIno"
        this.ready     = this._init();
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // IndexedDB bootstrap
    // ═══════════════════════════════════════════════════════════════════════════

    _openDB() {
        return new Promise((resolve, reject) => {
            const req = indexedDB.open("WebOSFS", 2);

            req.onupgradeneeded = (e) => {
                const db = e.target.result;

                // nodes: inode (number) → { type, content? }
                if (!db.objectStoreNames.contains("nodes")) {
                    db.createObjectStore("nodes"); // keyPath = out-of-line (inode number)
                }

                // dentries: compound key [parentInode, name] → childInode
                if (!db.objectStoreNames.contains("dentries")) {
                    db.createObjectStore("dentries", { keyPath: ["parent", "name"] });
                }

                // meta: inode → metadata object
                if (!db.objectStoreNames.contains("meta")) {
                    db.createObjectStore("meta"); // key = inode number OR "__nextIno"
                }
            };

            req.onsuccess  = (e) => resolve(e.target.result);
            req.onerror    = (e) => reject(e.target.error);
        });
    }

    async _init() {
        this._db = await this._openDB();

        // Load or seed the next-inode counter
        let stored = await this._metaGet("__nextIno");
        if (stored == null) {
            // Fresh DB — create root directory (inode 0)
            await this._txn(["nodes","dentries","meta"], "readwrite", (stores) => {
                const [nodes, , meta] = stores;
                nodes.put({ type: "dir" }, FS.ROOT_INODE);
                meta.put(this._makeMeta("dir", 0), FS.ROOT_INODE);
                meta.put(1, "__nextIno"); // next free inode = 1
            });
            this._nextIno = 1;
        } else {
            this._nextIno = stored;
        }

        // Verify .filesystem sentinel
        const check = await this.readFile([".filesystem"]);
        if (check[1] === false) {
            alert("Unrecoverable error: '.filesystem' missing. Recovering… " + check[2]);
            await this.createFile([".filesystem"], "");
            window.location.reload();
            return;
        }

        this.createEssentialFiles();
        this.moduleDirInit();
        this.wplModDIrInit();
        this.binDirInit();
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // Low-level DB helpers
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * Run a callback inside a single IDB transaction spanning the given stores.
     * Callback receives an array of IDBObjectStore handles in the same order.
     * Returns a Promise that resolves with the return value of the callback
     * (which may itself be a result value or undefined).
     */
    _txn(storeNames, mode, callback) {
        return new Promise((resolve, reject) => {
            const tx     = this._db.transaction(storeNames, mode);
            const stores = storeNames.map(n => tx.objectStore(n));
            let result;
            try {
                result = callback(stores);
            } catch(err) {
                tx.abort();
                return reject(err);
            }
            tx.oncomplete = () => resolve(result);
            tx.onerror    = (e) => reject(e.target.error);
            tx.onabort    = (e) => reject(e.target.error);
        });
    }

    /** Wrap a single IDBRequest in a Promise */
    _req(idbRequest) {
        return new Promise((resolve, reject) => {
            idbRequest.onsuccess = (e) => resolve(e.target.result);
            idbRequest.onerror   = (e) => reject(e.target.error);
        });
    }

    async _nodeGet(inode) {
        const tx = this._db.transaction("nodes", "readonly");
        return this._req(tx.objectStore("nodes").get(inode));
    }

    async _metaGet(key) {
        const tx = this._db.transaction("meta", "readonly");
        return this._req(tx.objectStore("meta").get(key));
    }

    async _dentryGet(parentInode, name) {
        const tx = this._db.transaction("dentries", "readonly");
        return this._req(tx.objectStore("dentries").get([parentInode, name]));
    }

    /** Allocate a new inode number (persists counter to DB) */
    async _allocIno() {
        const ino = this._nextIno++;
        // persist counter async (fire-and-forget is fine; we track it in memory)
        const tx = this._db.transaction("meta", "readwrite");
        tx.objectStore("meta").put(this._nextIno, "__nextIno");
        return ino;
    }

    _makeMeta(type, inode, extra = {}) {
        const now = Date.now();
        return {
            inode,
            type,
            permissions: type === "dir" ? 0o755 : 0o644, // unix-style, future use
            owner: "root",
            group: "root",
            created:  now,
            modified: now,
            accessed: now,
            size: 0,
            ...extra
        };
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // Path resolution helpers
    // ═══════════════════════════════════════════════════════════════════════════

    buildPath(pathStr) {
        return pathStr.split("/").filter(p => p);
    }

    parsePath(path) {
        if (path == null || path === undefined) return [...cwd];
        if (path.startsWith("/")) return this.buildPath(path);

        const parts  = path.split("/").filter(p => p.length > 0);
        const result = [...cwd];
        for (const part of parts) {
            if (part === "..") { if (result.length > 0) result.pop(); }
            else if (part !== ".") result.push(part);
        }
        return result;
    }

    /**
     * Walk a path array from root.
     * Returns { inode, parentInode, name, type } or null if not found.
     * If mustBeDir is true, returns null if the final component is a file.
     */
    async _resolvePath(pathArr) {
        let inode = FS.ROOT_INODE;
        let parent = null;

        for (let i = 0; i < pathArr.length; i++) {
            const name  = pathArr[i];
            const entry = await this._dentryGet(inode, name);
            if (entry == null) return null;

            parent = inode;
            inode  = entry.inode;
        }

        const node = await this._nodeGet(inode);
        if (!node) return null;
        return { inode, parentInode: parent, name: pathArr[pathArr.length - 1] ?? "", type: node.type };
    }

    /**
     * Walk to the *parent* directory of a path.
     * Returns { parentInode, name } or null.
     */
    async _resolveParent(pathArr) {
        if (pathArr.length === 0) return null;
        const parentPath = pathArr.slice(0, -1);
        const name       = pathArr[pathArr.length - 1];

        let inode = FS.ROOT_INODE;
        for (const seg of parentPath) {
            const entry = await this._dentryGet(inode, seg);
            if (!entry) return null;
            inode = entry.inode;
        }
        return { parentInode: inode, name };
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // Public API  (all original methods, now async, same return shape)
    // ═══════════════════════════════════════════════════════════════════════════

    async createFile(path, content) {
        const loc = await this._resolveParent(path);
        if (!loc) return ["", false, `Invalid path: /${path.join("/")}`];

        const { parentInode, name } = loc;

        // Check parent is a directory
        const parentNode = await this._nodeGet(parentInode);
        if (!parentNode || parentNode.type !== "dir") {
            return ["", false, `/${path.slice(0,-1).join("/")} is not a directory`];
        }

        // Check not already exists
        const existing = await this._dentryGet(parentInode, name);
        if (existing != null) {
            const ex = await this._nodeGet(existing.inode);
            if (ex.type === "dir") return ["", false, `/${path.join("/")} is a directory, cannot create file here`];
            return ["", false, `File /${path.join("/")} already exists`];
        }

        const bytes  = normalizeToBytes(content);
        const inode  = await this._allocIno();

        await this._txn(["nodes","dentries","meta"], "readwrite", ([nodes, dentries, meta]) => {
            nodes.put({ type: "file", content: bytes }, inode);
            dentries.put({ parent: parentInode, name, inode });
            meta.put(this._makeMeta("file", inode, { size: bytes.byteLength }), inode);
        });

        return [content, true, ""];
    }

    async createDirectory(path) {
        // Walk and create each segment if missing (mkdir -p style, matching original)
        let inode = FS.ROOT_INODE;

        for (const name of path) {
            const entry = await this._dentryGet(inode, name);
            if (entry != null) {
                const node = await this._nodeGet(entry.inode);
                if (node.type !== "dir") return ["", false, `/${name} is not a directory`];
                inode = entry.inode;
                continue;
            }

            const newIno = await this._allocIno();
            const parentIno = inode;
            await this._txn(["nodes","dentries","meta"], "readwrite", ([nodes, dentries, meta]) => {
                nodes.put({ type: "dir" }, newIno);
                dentries.put({ parent: parentIno, name, inode: newIno });
                meta.put(this._makeMeta("dir", newIno), newIno);
            });
            inode = newIno;
        }

        return ["", true, ""];
    }

    async deleteFile(path, force) {
        const isProtected = this.protectedFiles.some(p => JSON.stringify(p) === JSON.stringify(path));
        if (isProtected && !force) return ["", false, `File /${path.join("/")} is protected and cannot be deleted.`];

        const resolved = await this._resolvePath(path);
        if (!resolved) return ["", false, `Path /${path.join("/")} does not exist`];
        if (resolved.type === "dir") return ["", false, `/${path.join("/")} is a directory, not a file`];

        const { inode, parentInode, name } = resolved;
        await this._txn(["nodes","dentries","meta"], "readwrite", ([nodes, dentries, meta]) => {
            nodes.delete(inode);
            dentries.delete([parentInode, name]);
            meta.delete(inode);
        });
        return ["", true, ""];
    }

    async deleteDirectory(path, force) {
        const isProtected = this.protectedFiles.some(p => JSON.stringify(p) === JSON.stringify(path));
        if (isProtected && !force) return ["", false, `Directory /${path.join("/")} is protected and cannot be deleted.`];

        const resolved = await this._resolvePath(path);
        if (!resolved) return ["", false, `Directory /${path.join("/")} does not exist`];
        if (resolved.type !== "dir") return ["", false, `/${path.join("/")} is not a directory`];

        // Recursively collect all descendant inodes + dentry keys
        const inodesToDel  = [];
        const dentryKeys   = [];

        const collect = async (dirInode) => {
            inodesToDel.push(dirInode);
            const children = await this._listDentries(dirInode);
            for (const child of children) {
                dentryKeys.push([dirInode, child.name]);
                if (child.type === "dir") await collect(child.inode);
                else inodesToDel.push(child.inode);
            }
        };

        await collect(resolved.inode);
        // Also remove the dentry pointing to this dir from its parent
        if (resolved.parentInode !== null) {
            dentryKeys.push([resolved.parentInode, resolved.name]);
        }

        await this._txn(["nodes","dentries","meta"], "readwrite", ([nodes, dentries, meta]) => {
            for (const ino of inodesToDel) { nodes.delete(ino); meta.delete(ino); }
            for (const key of dentryKeys)  { dentries.delete(key); }
        });

        return ["", true, ""];
    }

    /** Internal: list dentries under a directory inode */
    async _listDentries(dirInode) {
        return new Promise((resolve, reject) => {
            const tx      = this._db.transaction(["dentries","nodes"], "readonly");
            const dStore  = tx.objectStore("dentries");
            const nStore  = tx.objectStore("nodes");
            const results = [];

            // IDB key range: all entries where parent === dirInode
            const range = IDBKeyRange.bound([dirInode, ""], [dirInode, "\uFFFF"]);
            const req   = dStore.openCursor(range);

            req.onsuccess = (e) => {
                const cursor = e.target.result;
                if (!cursor) { resolve(results); return; }

                const { name, inode } = cursor.value;
                const nodeReq = nStore.get(inode);
                nodeReq.onsuccess = (ne) => {
                    const node = ne.target.result;
                    if (node) results.push({ name, inode, type: node.type });
                    cursor.continue();
                };
                nodeReq.onerror = (e) => reject(e.target.error);
            };
            req.onerror = (e) => reject(e.target.error);
        });
    }

    async listFiles(path) {
        let inode = FS.ROOT_INODE;
        for (const name of path) {
            const entry = await this._dentryGet(inode, name);
            if (!entry) return [[], false, `Invalid path: /${path.join("/")}`];
            const node = await this._nodeGet(entry.inode);
            if (!node || node.type !== "dir") return [[], false, `/${path.join("/")} is not a directory`];
            inode = entry.inode;
        }

        const children = await this._listDentries(inode);
        const entries  = children.map(c => c.type === "dir" ? c.name + "/" : c.name);
        return [entries, true, ""];
    }

    async readFile(path, raw = false) {
        const resolved = await this._resolvePath(path);
        if (!resolved) return ["", false, `File /${path.join("/")} does not exist`];
        if (resolved.type === "dir") return ["", false, `/${path.join("/")} is a directory, not a file`];

        const node = await this._nodeGet(resolved.inode);

        // Update accessed timestamp (fire-and-forget)
        this._metaTouch(resolved.inode, { accessed: Date.now() });

        if (raw) return [node.content instanceof Uint8Array ? node.content : new Uint8Array(node.content), true, ""];
        return [base64ToUtf8(bytesToBase64(new Uint8Array(node.content))), true, ""];
    }

    async writeFile(path, content) {
        const loc = await this._resolveParent(path);
        if (!loc) return ["", false, `Invalid path: /${path.join("/")}`];

        const { parentInode, name } = loc;

        // Check for collision with a directory
        const existing = await this._dentryGet(parentInode, name);
        if (existing) {
            const node = await this._nodeGet(existing.inode);
            if (node.type === "dir") return ["", false, `/${path.join("/")} is a directory, not a file`];
            // Overwrite existing file
            const bytes = normalizeToBytes(content);
            const now   = Date.now();
            await this._txn(["nodes","meta"], "readwrite", ([nodes, meta]) => {
                nodes.put({ type: "file", content: bytes }, existing.inode);
                meta.put({ ...this._makeMeta("file", existing.inode), modified: now, accessed: now, size: bytes.byteLength }, existing.inode);
            });
            return [true, ""];
        }

        // Create new file (same as createFile without the exists check)
        const parentNode = await this._nodeGet(parentInode);
        if (!parentNode || parentNode.type !== "dir") {
            return ["", false, `/${path.slice(0,-1).join("/")} is not a directory`];
        }

        const bytes = normalizeToBytes(content);
        const inode = await this._allocIno();
        await this._txn(["nodes","dentries","meta"], "readwrite", ([nodes, dentries, meta]) => {
            nodes.put({ type: "file", content: bytes }, inode);
            dentries.put({ parent: parentInode, name, inode });
            meta.put(this._makeMeta("file", inode, { size: bytes.byteLength }), inode);
        });
        return [true, ""];
    }

    async movePath(srcPath, destPath) {
        if (JSON.stringify(srcPath) === JSON.stringify(destPath))
            return ["", false, "Source and destination paths are the same!"];

        const src = await this._resolvePath(srcPath);
        if (!src) return ["", false, `Source not found: /${srcPath.join("/")}`];

        // Resolve destination
        let destParentIno, destName;
        const destExisting = await this._resolvePath(destPath);

        if (destExisting && destExisting.type === "dir") {
            // Move inside that directory, keep original name
            destParentIno = destExisting.inode;
            destName      = src.name;
            const clash = await this._dentryGet(destParentIno, destName);
            if (clash) return ["", false, `Destination already contains /${destName}`];
        } else {
            // Rename / move to new name
            const loc = await this._resolveParent(destPath);
            if (!loc) return ["", false, `Invalid destination path: /${destPath.join("/")}`];
            destParentIno = loc.parentInode;
            destName      = loc.name;
        }

        // Atomic: remove old dentry, add new dentry
        await this._txn(["dentries","meta"], "readwrite", ([dentries, meta]) => {
            dentries.delete([src.parentInode, src.name]);
            dentries.put({ parent: destParentIno, name: destName, inode: src.inode });
            // touch modified on the moved node
            // (metadata read not available inside txn callback easily, so we schedule separately)
        });
        this._metaTouch(src.inode, { modified: Date.now() });

        return ["", true, "File moved successfully!"];
    }

    async copyPath(srcPath, destPath) {
        if (JSON.stringify(srcPath) === JSON.stringify(destPath))
            return ["", false, "Source and destination paths are the same!"];

        const src = await this._resolvePath(srcPath);
        if (!src) return ["", false, `Source not found: /${srcPath.join("/")}`];

        let destParentIno, destName;
        const destExisting = await this._resolvePath(destPath);

        if (destExisting && destExisting.type === "dir") {
            destParentIno = destExisting.inode;
            destName      = src.name;
            const clash = await this._dentryGet(destParentIno, destName);
            if (clash) return ["", false, `Destination already contains /${destName}`];
        } else {
            const loc = await this._resolveParent(destPath);
            if (!loc) return ["", false, `Invalid destination path: /${destPath.join("/")}`];
            destParentIno = loc.parentInode;
            destName      = loc.name;
        }

        if (src.type === "file") {
            const node  = await this._nodeGet(src.inode);
            const bytes = new Uint8Array(node.content); // copy bytes
            const inode = await this._allocIno();
            await this._txn(["nodes","dentries","meta"], "readwrite", ([nodes, dentries, meta]) => {
                nodes.put({ type: "file", content: bytes }, inode);
                dentries.put({ parent: destParentIno, name: destName, inode });
                meta.put(this._makeMeta("file", inode, { size: bytes.byteLength }), inode);
            });
        } else {
            // Recursive directory copy
            await this._copyDirRecursive(src.inode, destParentIno, destName);
        }

        return ["", true, "File copied successfully!"];
    }

    async _copyDirRecursive(srcIno, destParentIno, destName) {
        const newIno = await this._allocIno();
        await this._txn(["nodes","dentries","meta"], "readwrite", ([nodes, dentries, meta]) => {
            nodes.put({ type: "dir" }, newIno);
            dentries.put({ parent: destParentIno, name: destName, inode: newIno });
            meta.put(this._makeMeta("dir", newIno), newIno);
        });

        const children = await this._listDentries(srcIno);
        for (const child of children) {
            if (child.type === "dir") {
                await this._copyDirRecursive(child.inode, newIno, child.name);
            } else {
                const node  = await this._nodeGet(child.inode);
                const bytes = new Uint8Array(node.content);
                const inode = await this._allocIno();
                await this._txn(["nodes","dentries","meta"], "readwrite", ([nodes, dentries, meta]) => {
                    nodes.put({ type: "file", content: bytes }, inode);
                    dentries.put({ parent: newIno, name: child.name, inode });
                    meta.put(this._makeMeta("file", inode, { size: bytes.byteLength }), inode);
                });
            }
        }
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // Metadata helpers
    // ═══════════════════════════════════════════════════════════════════════════

    /** Update specific meta fields without reading first (fire-and-forget) */
    async _metaTouch(inode, fields) {
        const tx   = this._db.transaction("meta", "readwrite");
        const store = tx.objectStore("meta");
        const req   = store.get(inode);
        req.onsuccess = (e) => {
            const existing = e.target.result;
            if (existing) store.put({ ...existing, ...fields }, inode);
        };
    }

    /**
     * Public: read metadata for a given path.
     * Returns [metaObject, true, ""] or ["", false, errorMsg]
     */
    async stat(path) {
        const resolved = await this._resolvePath(path);
        if (!resolved) return ["", false, `/${path.join("/")} does not exist`];
        const m = await this._metaGet(resolved.inode);
        return [m, true, ""];
    }

    /**
     * Public: set permissions for a given path (unix octal, e.g. 0o644).
     * Returns ["", true, ""] or ["", false, errorMsg]
     */
    async chmod(path, permissions) {
        const resolved = await this._resolvePath(path);
        if (!resolved) return ["", false, `/${path.join("/")} does not exist`];
        await this._metaTouch(resolved.inode, { permissions });
        return ["", true, ""];
    }

    /**
     * Public: set owner/group for a given path.
     */
    async chown(path, owner, group) {
        const resolved = await this._resolvePath(path);
        if (!resolved) return ["", false, `/${path.join("/")} does not exist`];
        await this._metaTouch(resolved.inode, { owner, group });
        return ["", true, ""];
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // OS init helpers (unchanged logic, just awaited)
    // ═══════════════════════════════════════════════════════════════════════════

    async createEssentialFiles() {
        await this.createDirectory(["tools"]);
        await this.writeFile(["help.txt"], Utils.helpMessage);
        await this.writeFile(["tools","repair.run"],
            "#script\necho Repairing filesystem...\nrmf /.filesystem\ntouch /.filesystem\necho Repair complete!\n");
        await this.writeFile(["tools","test.wpl"], "#wpl\n" + code);
    }

    async wplModDIrInit() {
        await this.createDirectory(["wpl"]);
        await this.writeFile(["wpl","gfx.wpl"],  "#wpl\nEXEC load gfx\n");
        await this.writeFile(["wpl","date.wpl"], "#wpl\nEXEC load date\n");
        for (const mod in Utils.wplModules) {
            await this.writeFile(["wpl", mod], Utils.wplModules[mod]);
        }
    }

    async binDirInit() {
        await this.createDirectory(["bin"]);
        for (const cmd in Utils.wplCommands) {
            await this.writeFile(["bin", cmd], Utils.wplCommands[cmd]);
        }
    }

    async moduleDirInit() {
        await this.createDirectory(["modules"]);
        for (const mod of Loader.getAllModules()) {
            await this.createDirectory(["modules", mod]);
            const [files] = await this.listFiles(["modules", mod]);
            if (files.includes("autoload")) Loader.loadModule(mod);
        }
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // Legacy shim: getRoot() — kept for any internal code that used it directly.
    // Returns a live proxy that throws a clear error to catch stale callers.
    // ═══════════════════════════════════════════════════════════════════════════
    getRoot() {
        throw new Error("FS.getRoot() is no longer supported. Use the async FS methods directly.");
    }
}


class OsCalls{
    // kernel panic for mssinh filesystem module
    panicMessage10FS = "Kernel panic. Filesystem module not loaded! Auto reboot in 10s";
    // fixed:
    // :/ ls command can only be used to list in directories but not on files, maybe this will be changed in the future. but this also requires changing the cd function then if listFiles changes to also list files, because cd function depends on it, maybe function related callsbacks as 4th argument for return value?
    // file operation os calls are used to parse the full path which is then passed to the FS class which reads/writes content from/to the file with abs path
    async listfiles(path){
        console.log("Listing files in path: ", path);

        if(!this.probeFSModule()){
            this.panic10();
            return ["", false, this.panicMessage10FS]
        }
        
        let parsed_path = filesystem.parsePath(path);
        let output = await filesystem.listFiles(parsed_path);
        let entries = output[0];
        if(output[1] == false){
            return ["", false, output[2]];
        } else {
            return [entries.join(" "),true,""];
        }
        
    }
    probeFSModule(){
        return filesystem != null;
    }
    panicInstant(){
        window.location.reload();
    }
    panic10(){
        setTimeout( () => {
            window.location.reload();
        },10000)
    }
    async createFile(path, content){
        console.log("Creating file");

        if(!this.probeFSModule()){
            this.panic10();
            return ["", false, this.panicMessage10FS]
        }
        
        let parsed_path = filesystem.parsePath(path);
        let output = await filesystem.createFile(parsed_path, content); // need to be modified to list current dir if cwd and cd is implemented
        if(output[1] == false){
            return ["", false, output[2]];
        } else {
            return [output[0], true, ""];
        }
    }
    async deleteFile(path, force){
        console.log("Deleting file");

        if(!this.probeFSModule()){
            this.panic10();
            return ["", false, this.panicMessage10FS]
        }
        
        let parsed_path = filesystem.parsePath(path);
        let output = await filesystem.deleteFile(parsed_path, force); // need to be modified to list current dir if cwd and cd is implemented
        if(output[1] == false){
            return ["", false, output[2]];
        } else {
            return [output[0], true, ""];
        }
    }
    async createDir(path){
        console.log("Creating directory");

        if(!this.probeFSModule()){
            this.panic10();
            return ["", false, this.panicMessage10FS]
        }

        let parsed_path = filesystem.parsePath(path);
        let output = await filesystem.createDirectory(parsed_path);
        if(output[1] == false){
            return ["", false, output[2]];
        } else {
            return [output[0], true, ""];
        }
    }
    async deleteDir(path, force){
        console.log("Deleting directory");

        if(!this.probeFSModule()){
            this.panic10();
            return ["", false, this.panicMessage10FS]
        }

        let parsed_path = filesystem.parsePath(path);
        let output = await filesystem.deleteDirectory(parsed_path, force);
        if(output[1] == false){
            return ["", false, output[2]];
        } else {
            return [output[0], true, ""];
        }
    }
    async readFile(path, raw=false){
        console.log("Reading file");

        if(!this.probeFSModule()){
            this.panic10();
            return ["", false, this.panicMessage10FS]
        }

        let parsed_path = filesystem.parsePath(path);
        let output = await filesystem.readFile(parsed_path, raw);
        if(output[1] == false){
            return ["", false, output[2]];
        } else {
            return [output[0], true, ""];
        }
    }
    // similar to createFile, maybe merge them or remove support for adding content to files in createFile
    async writeFile(path, content){
        console.log("Writing file");

        if(!this.probeFSModule()){
            this.panic10();
            return ["", false, this.panicMessage10FS]
        }

        let parsed_path = filesystem.parsePath(path);
        let output = await filesystem.writeFile(parsed_path, content/*.replace(/\\n/g, "\n")*/);
        if(output[1] == false){
            return ["", false, output[2]];
        } else {
            return [output[0], true, ""];
        }
    }
    parsePathWrapper(path){
        let parsed_path = filesystem.parsePath(path);
        return parsed_path;
    }
    async movePath(srcPath, destPath) {

        if(!this.probeFSModule()){
            this.panic10();
            return ["", false, this.panicMessage10FS]
        }

        let parsed_srcPath = filesystem.parsePath(srcPath);
        let parsed_destPath = filesystem.parsePath(destPath);
        console.log('Source Path:', parsed_srcPath);
        console.log('Destination Path:', parsed_destPath);
        let output = await filesystem.movePath(parsed_srcPath, parsed_destPath);
        if (output[1] == false) {
            return ["", false, output[2]];
        } else {
            return [output[0], true, ""];
        }
    }
    async copyPath(srcPath, destPath) {

        if(!this.probeFSModule()){
            this.panic10();
            return ["", false, this.panicMessage10FS]
        }

        let parsed_srcPath = filesystem.parsePath(srcPath);
        let parsed_destPath = filesystem.parsePath(destPath);
        console.log('Source Path:', parsed_srcPath);
        console.log('Destination Path:', parsed_destPath);
        let output = await filesystem.copyPath(parsed_srcPath, parsed_destPath);
        if (output[1] == false) {
            return ["", false, output[2]];
        } else {
            return [output[0], true, ""];
        }
    }

    async getSize(src) {

        if(!this.probeFSModule()){
            this.panic10();
            return ["", false, this.panicMessage10FS]
        }

        let parsed_src = filesystem.parsePath(src);
        
        let output = await filesystem.stat(parsed_src);
        if (output[1] == false) {
            return ["", false, output[2]];
        } else {
            return [output[0].size, true, ""];
        }

    }

    // ntb implemented: add autoload command (+ e.g.:unautoload)
    async autoLoadMod(modname){
        console.log("Autoload module");

        if(!this.probeFSModule()){
            this.panic10();
            return ["", false, this.panicMessage10FS]
        }
        
        if(!Loader.getAllModules().includes(modname)){
            return ["", false, "Module doesn't exist"];
        }
        
        let parsedPath = filesystem.parsePath("/modules/"+modname+"/autoload");
        let output = await filesystem.createFile(parsedPath, "");
        // fails if file already exists so just ignore error

        //if(output[1] == false){
        //    return ["", false, "Autoload failed!: "+output[2]];
        //} else {
            return ["Autoload successfully enabled for module: "+modname, true, ""];
        //}
    }

    async unAutoLoadMod(modname){
        console.log("Autoload module");

        if(!this.probeFSModule()){
            this.panic10();
            return ["", false, this.panicMessage10FS]
        }
        
        if(!Loader.getAllModules().includes(modname)){
            return ["", false, "Module doesn't exist"];
        }
        
        let parsedPath = filesystem.parsePath("/modules/"+modname+"/autoload");
        let output = await filesystem.deleteFile(parsedPath, true);

        return ["Autoload disabled for module: "+modname, true, ""];
    }

}

/* GLOBAL VAR FOR HOLDING CANCEL FUNC OF CUR COMMAND */
let cancelFunction = undefined;

class Commands{
    async ls(args){
        let output = await OS.listfiles(args[0]); // first arg is path
        if(output[1] == false){
            return [output[2], "red", ""];
        } else {
            return [output[0], "green", ""];
        }

    }

    async cd(args){

        if(!OS.probeFSModule()){
            OS.panic10();
            return ["", false, OS.panicMessage10FS]
        }

        // normally filesystem class function should only be called from OsCalls class (Kernel)
        let parsed_path = OS.parsePathWrapper(args[0]);
        let output = await filesystem.listFiles(parsed_path);
        if(output[1] == false){
            return ["Directory does't exist!", "red", ""];
        }
        cwd = parsed_path;

        // !!! cwdPath shouldnt be used, it is only used for displaying the current path in the terminal

        cwdPath = cwd.join("/");
        cwdPath = "/"+cwdPath;
        // if changing directory to root, then cwdPath is empty, so return /
        return ["Current directory => "+cwdPath, "green", ""];
    }
    async touch(args){
        let output = await OS.createFile(args[0],"");
        if(output[1] == false){
            return [output[2], "red", ""];
        } else {
            return ["File created successfully!", "green", ""];
        }
    }
    async rm(args, force=false){
        if (args.length === 0) {
            return ["Usage: rm <files>", "yellow", ""];
        }

        let outputMessage = '';  // Initialize an empty string to store messages

        args.forEach(async file => {
            const result = await OS.deleteFile(file,force);
            
            if (result[1] === false) {
                outputMessage += `Error deleting ${file}: ${result[2]}\n`;  // Append error message
                return;  // Stop processing further files on error
            } else {
                outputMessage += `${file} deleted successfully!\n`;  // Append success message
            }
        });

        // If there were any errors, return the error message string
        if (outputMessage.includes("Error")) {
            return [outputMessage, "red", ""];
        }

        // If all deletions were successful, return the success message
        return [outputMessage, "green", ""];
    }
    async rmf(args){
        if(args.length === 0){
            return ["Usage: rmf <files>", "yellow", ""];
        }
        return await this.rm(args, true);
    }
    pwd(args){
        // cwdPath should be used here, because it is the current path
        return ["Current directory => "+cwdPath, "green", ""];
    }
    async mkdir(args){
        let output = await OS.createDir(args[0]);
        if(output[1] == false){
            return [output[2], "red", ""];
        } else {
            return ["Directory created successfully!", "green", ""];
        }
    }
    async rmdir(args, force=false) {
        if (args.length === 0) {
            return ["Usage: rmdir <dirs>", "yellow", ""];
        }
    
        let outputMessage = '';  // Initialize an empty string to store messages
    
        args.forEach(async dir => {
            const result = await OS.deleteDir(dir, force);
            
            if (result[1] === false) {
                outputMessage += `Error deleting directory ${dir}: ${result[2]}\n`;  // Append error message
                return;  // Stop processing further directories on error
            } else {
                outputMessage += `${dir} directory deleted successfully!\n`;  // Append success message
            }
        });
    
        // If there were any errors, return the error message string
        if (outputMessage.includes("Error")) {
            return [outputMessage, "red", ""];
        }
    
        // If all deletions were successful, return the success message
        return [outputMessage, "green", ""];
    }
    async rmdirf(args){
        if(args.length === 0){
            return ["Usage: rmdirf <dirs>", "yellow", ""];
        }
        return await this.rmdir(args, true);
    }
    async cat(args){
        // this should read the file and return the content
        let output = await OS.readFile(args[0]);
        if(output[1] == false){
            return [output[2], "red", ""];
        } else {
            return [output[0], "green", ""];
        }
    }
    async write(args){
        // this should write the file and return the content
        if (!args[0] || args.length < 2) {
            return ["Usage: write <filename> <content>", "yellow", ""];
        }
        
        let filename = args[0];
        let content = args.slice(1).join(" "); // combine all other args as content
        //console.log("Writing to file: ", filename, " with content: ", content);

        let exists = await OS.listfiles(args[0]);
        if(exists[1] == true){
            return ["Cannot write to a directory!", "red", ""];
        }
        
        let output = await OS.writeFile(filename, content);
        
        if (output[0] === false) {
            return [output[1], "red", ""];
        } else {
            return ["File written successfully!", "green", ""];
        }
    }
    echo(args){
        // this should write the file and return the content
        if (!args[0]) {
            return ["Usage: echo <content>", "yellow", ""];
        }
        return [args.join(" "), "green", ""];

    }
    async mv(args){
        // this should move the file and return the content
        if (args.length < 2) {
            return ["Usage: mv <source> <destination>", "yellow", ""];
        }
        
        let src = args[0];
        let dest = args[1];
        
        let output = await OS.movePath(src, dest);
        
        if (output[1] == false) {
            return [output[2], "red", ""];
        } else {
            return ["File moved successfully!", "green", ""];
        }
    }
    async cp(args){
        // this should copy the file and return the content
        if (args.length < 2) {
            return ["Usage: cp <source> <destination>", "yellow", ""];
        }
        
        let src = args[0];
        let dest = args[1];
        
        let output = await OS.copyPath(src, dest);
        
        if (output[1] == false) {
            return [output[2], "red", ""];
        } else {
            return ["File copied successfully!", "green", ""];
        }
    }
    async exist(args) {
        if (!args[0]) {
            return ["Usage: exist <path>", "yellow", ""];
        }
    
        // Check if it's a file
        let output = await OS.readFile(args[0]);
        if (output[1]) {
            return ["true", "green", ""];
        }
    
        // Check if it's a directory
        output = await OS.listfiles(args[0]);
        if (output[1]) {
            return ["true", "green", ""];
        }
    
        return ["false", "green", ""];
    }
    async append(args){
        // this should write the file and return the content
        if (!args[0] || args.length < 2) {
            return ["Usage: append <filename> <content>", "yellow", ""];
        }
        
        let filename = args[0];
        let content = args.slice(1).join(" "); // combine all other args as content
        //console.log("Writing to file: ", filename, " with content: ", content);

        let exists = await OS.readFile(args[0]);
        if(exists[1] == false){
            return [exists[2], "red", ""];
        }

        let curContent = await OS.readFile(filename);
        
        let output = await OS.writeFile(filename, curContent[0]+content);
        
        if (output[0] === false) {
            return [output[1], "red", ""];
        } else {
            return ["File written successfully!", "green", ""];
        }
    }
    async run(args){
        // this should run the file and return the content
        if (!args[0]) {
            return ["Usage: run <filename>", "yellow", ""];
        }
        let filename = args[0];
        let output = await OS.readFile(filename);

        if (output[1] == false) {
            return [output[2], "red", ""];
        }

        // executable files need to have '#script' in the first line
        if(output[0].split("\n")[0] !== "#script"){
            return ["File is not executable!", "red", ""];
        }
        
        
        // run the file
        let lines = output[0].split("\n");
        for (let i = 1; i < lines.length; i++) {
            let line = lines[i];
            let result = await commandManager.executeCommand(line);
            if (result) {
                // Display output if any
                const outputLine = document.createElement('div');
                outputLine.classList.add('output-line');
                outputLine.textContent = result[0];
                outputLine.style.color = result[1];
                terminal.appendChild(outputLine);
            }
        }
        return ["File executed successfully!", "green", ""];
        
    }
    load(args){
        // mdoule loader
        if (!args[0]) {
            return ["Usage: load <module>", "yellow", ""];
        }

        let output = Loader.loadModule(args[0]);
        if(output[1] == false){
            return [output[2], "red", ""];
        } else {
            return ["Module loaded successfully!", "green", ""];
        }
    }
    loadAll(args){
        // mdoule loader

        let output = Loader.loadAllModules();
        if(output[1] == false){
            return [output[2], "red", ""];
        } else {
            return [output[2], "green", ""]; // All modules loaded!
        }
    }
    unload(args){
        // mdoule loader
        if (!args[0]) {
            return ["Usage: unload <module>", "yellow", ""];
        }
        let output = Loader.unloadModule(args[0]);
        if(output[1] == false){
            return [output[2], "red", ""];
        }
        return ["Module unloaded successfully!", "green", ""];
    }
    date(args){
        if(!Modules.date){
            return [Modules.moduleNotLoaded+" Module needed: date", "red", ""];
        }
        let output = Modules.date.getCurrentDate(args[0]);
        return [output, "green", ""];
    }
    randint(args){ 
        if(!Modules.random){
            return [Modules.moduleNotLoaded+" Module needed: random", "red", ""];
        }
        if(args.length < 2){
            return ["Usage: randint <min> <max>", "yellow", ""];
        }
        if(isNaN(args[0]) || isNaN(args[1])){
            return ["Arguments must be numbers!", "red", ""];
        }
        let output = Modules.random.getRandomInt(args[0], args[1]);
        return [output, "green", ""];
    }
    randfloat(args){  
        if(!Modules.random){
            return [Modules.moduleNotLoaded+" Module needed: random", "red", ""];
        }
        if(args.length < 2){
            return ["Usage: randfloat <min> <max>", "yellow", ""];
        }
        if(isNaN(args[0]) || isNaN(args[1])){
            return ["Arguments must be numbers!", "red", ""];
        }
        let output = Modules.random.getRandomFloat(args[0], args[1]);
        return [output, "green", ""];
    }
    randstring(args){
        if(!Modules.random){
            return [Modules.moduleNotLoaded+" Module needed: random", "red", ""];
        }
        if(!args[0]){
            return ["Usage: randstring <length>", "yellow", ""];
        }
        if(isNaN(args[0])){
            return ["Length must be a number!", "red", ""];
        }
        let output = Modules.random.getRandomString(args[0]);
        return [output, "green", ""];
    }
    help(args){
        return [Utils.helpMessage, "green", ""];
    }
    modinfo(args){
        let loadedModules = Loader.getLoadedModules();
        let allModules = Loader.getAllModules();
        return ["All modules:\n   "+allModules.join("\n   ")+"\nLoaded modules:\n   "+loadedModules.join("\n   "), "green", ""];
    }
    reboot(args){
        // this should reboot the system
        // maybe add a confirmation dialog
        let timeout;
        if(!args[0]){
            timeout = 0;
        } else if(isNaN(args[0])){
                return ["Time must be a number!", "red", ""];
        } else {
            timeout = args[0];
        }
        setTimeout(() => {
            window.location.reload();
        }, timeout*1000);
        return ["Rebooting in "+timeout+" seconds ...", "green", ""];
    }
    exit(args){
        // this should exit the system
        // maybe add a confirmation dialog
        let timeout;
        if(!args[0]){
            timeout = 0;
        } else if(isNaN(args[0])){
                return ["Time must be a number!", "red", ""];
        } else {
            timeout = args[0];
        }
        setTimeout(() => {
            window.close();
        }, timeout*1000);
        return ["Exiting in "+timeout+" seconds ...", "green", ""];
    }
    async edit(args){
        // this should open the file in edit mode
        if (!args[0]) {
            return ["Usage: edit <filename>", "yellow", ""];
        }
        let filename = args[0];
        let parsed_filename = filesystem.parsePath(filename)
        let output = await OS.readFile(filename);
        // check if direcory, if it is, this returns true, so dont continue, if target doesnt exist at all, thenn readFile fails
        let entries = await filesystem.listFiles(parsed_filename);

        // open the file in edit mode
        if(entries[1]){ // is a dir
            return [args[0]+" is a directory!","red",""]
        } else if (output[1] == false) {
            editView(filename, "", true); // newfile
        } else {
            editView(filename, output[0], false);
        }
        
        editViewOpened = true;
        return ["File opened in edit mode!", "green", ""];
    }
    history(args){
        return [commandStack.join("\n"),"green"]
    }
    async ping(args) {
        if (!Modules.net) {
            return ["net module not loaded (need: net)", "red", ""];
        }
        if (!args[0]) {
            return ["Usage: ping <ip/domain>", "yellow", ""];
        }

        try {
            const [resultPromise, cancelFunc] = Modules.net.ping(args[0]);
            
            cancelFunction = cancelFunc;
            const result = await resultPromise;

            //console.log(result);

            if (result.success) {
                return [
                    `Host ${args[0]} is up   latency=${result.latency}ms`,
                    "green",
                    ""
                ];
            } else {
                return [
                    `Host ${args[0]} unreachable: ${result.error}`,
                    "red",
                    ""];
            }
        } catch (err) {
            return [`Ping failed: ${err.message}`, "red", ""];
        }
    }
    async fetch(args) {
        if (!Modules.net) {
            return ["net module not loaded (need: net)", "red", ""];
        }
        if (!args[0] || !args[1]) {
            return ["Usage: fetch <ip/domain> <file>", "yellow", ""];
        }

        try {
            let filename =  args[1];

            const [resultPromise, cancelFunc] = Modules.net.fetch(args[0]);
            
            cancelFunction = cancelFunc;
            const result = await resultPromise;

            const data = await result.data;
            console.log(data);

            if (result.success) {
                let writeres = this.write([filename,data]);
                let cmdout = `Fetch to ${args[0]} success. File successfully written!`;
                if(writeres[1] == "red"){
                    cmdout =  `Fetch to ${args[0]} success. File write failed! Reason: ${writeres[0]}`;
                }
                return [
                    cmdout,
                    writeres[1],
                    ""
                ];
            } else {
                return [
                    `Host ${args[0]} unreachable: ${result.error}`,
                    "red",
                    ""];
            }
        } catch (err) {
            return [`Fetch failed: ${err.message}`, "red", ""];
        }
    }
    async oldwpl(args) {
        if (!Modules.wpl) {
            return ["oldwpl module not loaded (need: oldwpl)", "red", ""];
        }
        if (!args[0]) {
            return ["Usage: wpl <filename>", "yellow", ""];
        }
        let filename = args[0];
        let output = await OS.readFile(filename);

        if (output[1] == false) {
            return [output[2], "red", ""];
        }

        // executable files in webos pl need to have '#wpl' in the first line
        if(output[0].split("\n")[0] !== "#wpl"){
            return ["File is not executable!", "red", ""];
        }

        let wplcode = output[0].slice(1);
        
        // for now execute directly
        let wplout = await Modules.oldwpl.run(wplcode, true);

        console.log(wplout);

        if(!Modules.oldwpl.error){
            // output already done directly inside interpreter
            return ["File executed successfully!"/*wplout*/, "green", ""];
        } else {
            return ["File executed with errors!", "red", ""];
        }
    }

    async wpl(args) {
        if (!Modules.wpl) {
            return ["wpl module not loaded (need: wpl)", "red", ""];
        }
        if (!args[0]) {
            return ["Usage: wpl <filename>", "yellow", ""];
        }
        let filename = args[0];
        let output = await OS.readFile(filename);

        if (output[1] == false) {
            return [output[2], "red", ""];
        }

        // executable files in webos pl need to have '#wpl' in the first line
        if(output[0].split("\n")[0] !== "#wpl"){
            return ["File is not executable!", "red", ""];
        }

        //let wplcode = output[0].slice(1);
        let wplcode = output[0].split("\n").slice(1).join("\n");

        // for now execute directly
        //let wplout = await Modules.wpl.run(wplcode, true);


        //let woplcompjs = new WOPLCOMPJS();
        const js = await Modules.wpl.compile(wplcode);
        console.log(js);

        // run it
        try {
            //await new Function(js)(wplenv);
            const runFn = new Function('wplenv', 'Modules', 'args', js);
            await runFn(wplenv, Modules, args); /* args is later converted to WOPLArray */
        } catch (err) {
            console.error("Error executing WPL code:", err);
            return ["File executed with errors! Error: "+err.message, "red", ""];
        }
        console.log("WPL code executed!!!!!!!!!!!!!!");
        
        //console.log(wplout);

        //if(!Modules.wpl.error){
            // output already done directly inside interpreter
        /*    return ["File executed successfully!", "green", ""];
        } else {
            return ["File executed with errors!", "red", ""];
        }*/
    }

    async autoload(args){
        // mdoule loader
        if (!args[0]) {
            return ["Usage: autoload <module>", "yellow", ""];
        }

        let output = await OS.autoLoadMod(args[0]);
        console.log(output);
        if(output[1] == false){
            return [output[2], "red", ""];
        } else {
            return [output[0], "green", ""];
        }
    }
    async unautoload(args){
        // mdoule loader
        if (!args[0]) {
            return ["Usage: unautoload <module>", "yellow", ""];
        }

        let output = await OS.unAutoLoadMod(args[0]);
        if(output[1] == false){
            return [output[2], "red", ""];
        } else {
            return [output[0], "green", ""];
        }
    }
    /*export(args){

        if (!args[0]) {
            return ["Usage: export <filename>", "yellow", ""];
        }

        let output = OS.readFile(args[0]);
        if(output[1] == false){
            return [output[2], "red", ""];
        }

        const blob = new Blob([output[0]], { type: "text/plain" });
        const url = URL.createObjectURL(blob);

        const a = document.createElement("a");
        a.href = url;
        a.download = args[0];
        a.click();

        URL.revokeObjectURL(url);
    }*/
    async export(args) {
        if (!args[0]) {
            return ["Usage: export <filename>", "yellow", ""];
        }

        // ✅ get RAW bytes
        let output = await OS.readFile(args[0], true);

        if (output[1] == false) {
            return [output[2], "red", ""];
        }

        const bytes = output[0]; // Uint8Array

        // ✅ detect file type (optional but nice)
        let mimeType = "application/octet-stream";

        const name = args[0].toLowerCase();
        if (name.endsWith(".mp3")) mimeType = "audio/mpeg";
        if (name.endsWith(".wav")) mimeType = "audio/wav";
        if (name.endsWith(".png")) mimeType = "image/png";
        if (name.endsWith(".jpg") || name.endsWith(".jpeg")) mimeType = "image/jpeg";
        if (name.endsWith(".txt")) mimeType = "text/plain";

        // ✅ create blob from raw bytes
        const blob = new Blob([bytes], { type: mimeType });
        const url = URL.createObjectURL(blob);

        const a = document.createElement("a");
        a.href = url;
        a.download = args[0];
        a.click();

        URL.revokeObjectURL(url);
    }
    async import(args) {
        try {
            let file;

            if (window.showOpenFilePicker) {
                const [fileHandle] = await window.showOpenFilePicker();
                file = await fileHandle.getFile();
            } else {
                file = await new Promise((resolve) => {
                    const input = document.createElement("input");
                    input.type = "file";
                    input.onchange = (e) => resolve(e.target.files[0]);
                    input.click();
                });
            }

            if (!file) return ["No file selected", "red", ""];

            // Always read as binary — never use .text() for imported files
            const content = await file.arrayBuffer();

            let res = await OS.createFile(file.name, content);
            if (res[1] == false) return [res[2], "red", ""];

            return ["File successfully imported: " + file.name, "green", ""];

        } catch (err) {
            return ["Error importing file: " + err.message, "red", ""];
        }
    }
    async aload(args) {
        if (!Modules.audio) {
            return ["audio module not loaded (need: audio)", "red", ""];
        }
        if (!args[0]) {
            return ["Usage: aload <filename>", "yellow", ""];
        }
        let filename = args[0];
        let output = await OS.readFile(filename, true); // read as binary

        if (output[1] == false) {
            return [output[2], "red", ""];
        }

        await Modules.audio.load(output[0]);
        if(!Modules.audio.currentBuffer){
            return ["Failed to load audio!", "red", ""];
        } else {
            return ["Audio loaded successfully!", "green", ""];
        }
        //let a = new AudioPlayer()
        //a.load()

    }

    async aplay(args) {
        if (!Modules.audio) {
            return ["audio module not loaded (need: audio)", "red", ""];
        }

        if(!Modules.audio.currentBuffer){
           return ["No audio loaded!", "red", ""];
        }

        Modules.audio.play();
        //let a = new AudioPlayer()
        //a.load()

    }

    async apause(args) {
        if (!Modules.audio) {
            return ["audio module not loaded (need: audio)", "red", ""];
        }

        
        if(!Modules.audio.currentBuffer){
           return ["No audio loaded!", "red", ""];
        }

        Modules.audio.pause();
    }

    async astats(args) {
        if (!Modules.audio) {
            return ["audio module not loaded (need: audio)", "red", ""];
        }

        if(!Modules.audio.currentBuffer){
           return ["No audio loaded!", "red", ""];
        }

        let currentTime = Modules.audio.getCurrentTime();
        let duration = Modules.audio.getDuration();
        let isPlaying = Modules.audio.isPlaying;

        return [`Current Time: ${currentTime.toFixed(2)}s\nDuration: ${duration.toFixed(2)}s\nPlaying: ${isPlaying}`, "green", ""]

    }

    // ...

    async size(args) {
        if (!args[0]) {
            return ["Usage: size <path>", "yellow", ""];
        }
        let output = await OS.getSize(args[0]);
        if (output[1] == false) {
            return [output[2], "red", ""];
        } else {
            return [`Size of ${args[0]}: ${output[0]} bytes`, "green", ""];
        }

    }
}

let filesystem = new FS();
await filesystem.ready;
let OS = new OsCalls();
let commands = new Commands();
// date/random,.. other modules are initalized by load command

// CLASS COMMANDMANAGER
class CommandManager {

    constructor() {
        this.availableCommands = {
            clear: "",
            help: commands.help,
            ls: commands.ls,
            cd: commands.cd,
            cat: commands.cat,
            echo: commands.echo,
            mkdir: commands.mkdir,
            rmdir: commands.rmdir,
            rmdirf: commands.rmdirf,
            rm: commands.rm,
            rmf: commands.rmf,
            touch: commands.touch,
            pwd: commands.pwd,
            write: commands.write,
            mv: commands.mv,
            cp: commands.cp,
            exist: commands.exist,
            append: commands.append,
            run: commands.run,
            date: commands.date,
            load: commands.load,
            randint: commands.randint,
            randfloat: commands.randfloat,
            randstring: commands.randstring,
            loadall: commands.loadAll,
            unload: commands.unload,
            modinfo: commands.modinfo,
            reboot: commands.reboot,
            exit: commands.exit,
            edit: commands.edit,
            history: commands.history,
            ping: commands.ping,
            fetch: commands.fetch,
            oldwpl: commands.oldwpl,
            wpl: commands.wpl,
            autoload: commands.autoload,
            unautoload: commands.unautoload,
            export: commands.export,
            import: commands.import,
            size: commands.size,

            // audio
            aload: commands.aload,
            aplay: commands.aplay,
            apause: commands.apause,
            astats: commands.astats,
        };
        this.asyncCommands = ["ping"]
    }

    commandNotFound(command){
        const message = `Command not found: ${command}`;
        return message;
    }
    
    
    async executeCommand(cmd) {

        // return:
        // [output, color, other_evets_handled_directly]

        cmd = cmd.trim();

        let command = cmd.split(' ')[0];
        const args = cmd.split(' ').slice(1);

        if(command=="clear"){
            return ["","","clear"];
        } else if (command in this.availableCommands) {
            let res = await this.availableCommands[command](args);
            return res;
        } else {

            // if command is a wpl command in /bin/*.wpl
            if(command in Utils.wplCommands || (await OS.listfiles("/bin"))[0].includes(command) && command != ""){
                // exec command
                let res = this.availableCommands["wpl"]( ["/bin/"+command, ...args] );
                return res;
            }

            if(command!=""){
                return [this.commandNotFound(command), "red",""];
            }
        }
    }
}



let commandManager = new CommandManager();

// test if command calling works from here
/*
(async () => {
let test = await commandManager.executeCommand("ls /");
console.log("TEST: "+test);
})();*/

/*
(async () => {
    const interpreter = new WebOSPLang();
    let output = await interpreter.run(code);
    console.log(output);
})();*/

let inputDiv;
function createInputLine() {
    line = document.createElement('div');
    line.classList.add('input-line');
    line.innerHTML = `( ${cwdPath} ) >> `;
  
    // Create contenteditable "input" area
    inputDiv = document.createElement('div');
    inputDiv.classList.add('cli-input-editable');
    inputDiv.contentEditable = true;
    inputDiv.style.display = 'inline-block';
    inputDiv.style.minWidth = '10px'; // Allows shrinking
    line.appendChild(inputDiv);
    terminal.appendChild(line);
    inputDiv.focus();

    // auto completition stuff
    let curCmdAutoCompleteIndex = 0;
    let cmdMatch;
    let curCmdInput = "";

    let commandExecuting = false;

    let cancelFunc = null;

    // extra function to remove the event listener before function gets called again!!
    async function eventListener(event){
        if(commandExecuting){
            event.preventDefault()
        }

        if (event.key === 'Enter' && !event.shiftKey && !editViewOpened) {
            event.preventDefault();

            if(!commandExecuting){
                // scroll to bottom to avoid weird auto scroll issues
                window.scrollTo(0, document.body.scrollHeight);

                const command = inputDiv.innerText.trim();

                // go to latest command in history
                historyPosition = -1;

                if(command && command != commandStack[commandStack.length - 1]){ // command should not be empty
                    commandStack.push(command); // Add command to stack
                }
 
                let output = null;
                // Process command
                try {
                    commandExecuting = true;
                    /*
                    NOT NEEDED ANYMORE:                                          //IMPORTANT: async command functions return a list of the result and a cancel function to terminate the execution of the command. the cancel function need to be defined somewhere for example in ping command in the network class and returned all the way up to here. it should cancel the command!!!
                    */
                    cancelFunction = undefined; // clear cancel function before exec
                    output = await commandManager.executeCommand(command);
                    //console.log(cancelFunction);
                    cancelFunc = undefined; // for safety
                } catch(err){

                } finally {
                    //console.log("DONE!!!");
                    commandExecuting = false;
                }

                if(!editViewOpened){
                    // Display the entered command (with formatting)
                    line.innerText = `( ${oldCwd} ) >> ${command}`;

                    // this is very important, soif switching directories, the line where cd was entered stays the old dir
                    oldCwd=cwdPath;
                    
                    // Display output if any
                    if (output) {
                        // some commands handled here directly
                        if(output[2] == "clear"){
                            terminal.innerHTML = "";
                        } else {
                            const outputLine = document.createElement('div');
                            outputLine.classList.add('output-line');
                            outputLine.textContent = output[0];
                            outputLine.style.color = output[1];
                            terminal.appendChild(outputLine);
                        }
                    }


                    window.scrollTo(0, document.body.scrollHeight);
                    document.removeEventListener('keydown',eventListener)
                    document.removeEventListener('keydown',inputEvent)
                    createInputLine();

                }

            }
        } else if (event.key === 'ArrowUp') {
            event.preventDefault();
            
            if(!commandExecuting){
                if (commandStack.length === 0) return;
        
                if (historyPosition === -1) {
                    // Save the input before history scroll begins
                    currentInputBeforeHistory = inputDiv.innerText.trim();
                }
        
                if (historyPosition < commandStack.length - 1) {
                    historyPosition++;
                    inputDiv.innerText = commandStack[commandStack.length - 1 - historyPosition];
                    moveCursorToEnd(inputDiv);
                }

                // adjust width for div
                inputDiv.style.width = 'auto';
                inputDiv.style.width = (inputDiv.scrollWidth+2) + 'px';
            }
        }
    
        // Navigate down through history
        else if (event.key === 'ArrowDown') {
            event.preventDefault();

            if(!commandExecuting){
                if (historyPosition === -1) return;
        
                if (historyPosition > 0) {
                    historyPosition--;
                    inputDiv.innerText = commandStack[commandStack.length - 1 - historyPosition];
                } else {
                    // Reset to the original input before navigating
                    historyPosition = -1;
                    inputDiv.innerText = currentInputBeforeHistory;
                }
                
                moveCursorToEnd(inputDiv);

                inputDiv.style.width = 'auto';
                inputDiv.style.width = (inputDiv.scrollWidth+2) + 'px';
            }
        }
        /// auto completition need to be added
        else if (event.key === 'Tab') {
            event.preventDefault();
    
            if(!commandExecuting){

                let cmdMatch = [];
        
                const parts = inputDiv.textContent.split(" ");
                if (parts.length < 2) {
                    // command completion
                    cmdMatch = Object.keys(commandManager.availableCommands)
                        .filter(key => key.startsWith(curCmdInput));
                    
                    // wpl commands
                    cmdMatch = cmdMatch.concat(Object.keys(Utils.wplCommands)
                        .filter(key => key.startsWith(curCmdInput)));
                } else {
                    // file/folder completion
                    const [entries, ok] = await filesystem.listFiles(cwd);
                    if (ok) {
                        cmdMatch = entries
                            .filter(name => name.startsWith(curCmdInput));
                    }
                }

                // weird auto completition logic for subdirs
                /*if(cmdMatch.includes(curCmdInput)){
                    console.log("cur cmd input: "+curCmdInput)
                    console.log("Entering subdir!!")
                    console.log("Parsed: "+filesystem.parsePath(curCmdInput))
                    const [entries, ok] = filesystem.listFiles(filesystem.parsePath(curCmdInput));
                    console.log(curCmdInput.split("/").slice(0,-1))
                    console.log("entriies:"+entries)
                    cmdMatch = entries
                        .filter(name => name.startsWith(curCmdInput.split("/")[curCmdInput.split("/").length-1]));
                    
                    for(let i=0;i<cmdMatch.length;i++){
                        cmdMatch[i]=(cwd.length<1?"/":"")+curCmdInput.split("/").slice(0,-1).join("/")+"/"+cmdMatch[i];
                    }
                    console.log("Matches: "+cmdMatch);
                }*/
        
                if (cmdMatch.length > 0) {
                    // advance index
                    curCmdAutoCompleteIndex = (curCmdAutoCompleteIndex + 1) % cmdMatch.length;
        
                    if (parts.length < 2) {
                        // replace entire command
                        inputDiv.textContent = cmdMatch[curCmdAutoCompleteIndex];
                    } else {
                        // replace only the second part
                        inputDiv.textContent = parts[0] + " " + cmdMatch[curCmdAutoCompleteIndex];
                    }
        
                    // resize and move cursor // why not using the moveCursorToEnd function?!
                    inputDiv.style.width = 'auto';
                    inputDiv.style.width = (inputDiv.scrollWidth + 2) + 'px';
                    const range = document.createRange();
                    range.selectNodeContents(inputDiv);
                    range.collapse(false);
                    const sel = window.getSelection();
                    sel.removeAllRanges();
                    sel.addRange(range);
                }
            }
        }
    }

    function interruptExecEvListener(event){
        if(event.ctrlKey && event.key.toLowerCase() === 'c'){
            console.log("Terminating ...");
            // in case if cancel func defined (only for async commands like ping)
            cancelFunction();
        }
    }

    // Handle keyboard input
    inputDiv.addEventListener('keydown', eventListener);
    window.addEventListener('keydown', interruptExecEvListener);

    // input div resize + auto completition stuff
    function inputEvent(event) {
        // Resize
        this.style.width = 'auto';
        this.style.width = (this.scrollWidth + 2) + 'px';
    
        if (!["Tab","Enter","ArrowUp","ArrowDown"].includes(event.key)) {
            const parts = this.textContent.split(" ");
            if (parts.length < 2) {
                // typing command
                curCmdInput = parts[0] || "";
            } else {
                // typing argument
                curCmdInput = parts[1];
            }
            // Reset autocomplete index when input changes
            curCmdAutoCompleteIndex = -1;
        }
    }
  
    // Auto-expand width as user types
    inputDiv.addEventListener('input', inputEvent);
}

// maybe moving this to the top?
let syntaxHighLighting = {
    run: {
      blue: ["#script"],
      green: [
        "clear", "help", "ls", "cd", "cat", "echo", "mkdir", "rmdir", 
        "rmdirf", "rmf", "rm", "touch", "pwd", "write", "mv", "cp", 
        "exist", "append", "run", "date", "load", "randint", "randfloat", 
        "randstring", "loadall", "unload", "modinfo", "reboot", "exit", 
        "edit", "history","ping","fetch","wpl"
    ],
    },
    wpl: {
      blue: ["#wpl"],
      green: [
        "GINIT", "GCLOSE", "GCLEAR", "GPIXEL", "GLINE", "GRECT", 
        "GFRECT", "GCIRCLE", "GFCIRCLE", "GTEXT","GUSED",
        "SLEEP ", "ISDOWN ", "INDEX ",
        "CLASS ","METHOD ","NEW ","FIELD "," EXTENDS ","SUPER","INSTANCEOF", " AND "," OR "," NOT ","TRUE","FALSE","NULL", "STRING","ARRAY","FOREACH",
        "LET","PRINT","INPUT", "FUNCTION ","PARAM","RETURN","START",
        "RAND","FPTOI","ABS","SQRT","SIN","COS",
        "APPEND ","REMOVE ", "END","CALL","WITH","IF","ELSE","THEN",
        "EXEC","ITER"," TO ", "WHILE ", " STEP ", "BREAK", "CONTINUE",
        " INDEX ", " FROM ", " AT ", "SET ", "FIND ", " IN ", "LENGTH ",
        "LIST", "CLEAR ", " ALL ",
      ],
    }
};

/*
function syntaxHighlight(inputDiv, extension) {
    // 1) save caret position as character offset
    const caretOffset = getCaretCharacterOffsetWithin(inputDiv);

    // 2) build highlighted HTML
    let text = inputDiv.innerText;
    if (!syntaxHighLighting[extension]) return;
    Object.entries(syntaxHighLighting[extension]).forEach(([color, parts]) => {
        parts.forEach(part => {
        const esc = part.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, "\\$&");
        const re = new RegExp(`(${esc})`, "g");
        text = text.replace(re, `<span style="color:${color}">$1</span>`);
        });
    });

    // 3) update the div
    inputDiv.innerHTML = text;

    // 4) restore caret
    setCaretToPosition(inputDiv, caretOffset);
}*/
// old

// new (comments + string support):
function syntaxHighlight(inputDiv, extension) {


    // needed for files in /bin to work
    if(inputDiv.innerText.startsWith("#wpl")) {
        extension = "wpl";
    }

    // 1) Save caret position
    const caretOffset = getCaretCharacterOffsetWithin(inputDiv);
    let text = inputDiv.innerText;

    if (!syntaxHighLighting[extension]) return;

    // 2) Extract & protect comments
    const comments = [];
    text = text.replace(/#.*$/gm, (match) => {
        comments.push(match);
        return `__COMMENT_${comments.length - 1}__`;
    });

    // 3) Highlight strings first (including the quotes)
    // This matches "anything" (including escaped quotes inside)
    text = text.replace(/(["'])(?:(?=(\\?))\2.)*?\1/g, (match) => {
        return `<span style="color:#4EC9B0">${match}</span>`;   // Light blue / teal for strings
    });

    // 4) Highlight keywords
    Object.entries(syntaxHighLighting[extension]).forEach(([color, parts]) => {
        parts.forEach(part => {
            const esc = part.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, "\\$&");
            const re = new RegExp(`\\b(${esc})\\b`, "g");   // Added word boundaries for safety
            text = text.replace(re, `<span style="color:${color}">$1</span>`);
        });
    });

    // 5) Restore comments as grey
    text = text.replace(/__COMMENT_(\d+)__/g, (_, i) => {
        return `<span style="color:gray">${comments[i]}</span>`;
    });

    // 6) Update div
    inputDiv.innerHTML = text;

    // 7) Restore caret position
    setCaretToPosition(inputDiv, caretOffset);
}


function getCaretCharacterOffsetWithin(el) {
    const sel = window.getSelection();
    if (!sel.rangeCount) return 0;

    const range = sel.getRangeAt(0).cloneRange();
    range.selectNodeContents(el);
    range.setEnd(sel.focusNode, sel.focusOffset);
    return range.toString().length;
}

/**
 * Given a character offset, walk the text-nodes of `el` to re-place
 * the caret at that offset.
 */
function setCaretToPosition(el, chars) {
    const sel = window.getSelection();
    const range = document.createRange();
    let nodeStack = [el], node, charCount = 0, found = false;

    range.setStart(el, 0);
    range.collapse(true);

    while (nodeStack.length && !found) {
        node = nodeStack.pop();
        if (node.nodeType === 3) { // text node
            const nextCount = charCount + node.length;
            if (chars <= nextCount) {
                range.setStart(node, chars - charCount);
                range.collapse(true);
                found = true;
            } else {
                charCount = nextCount;
            }
        } else {
            // push children in reverse so we traverse in document order
            for (let i = node.childNodes.length - 1; i >= 0; i--) {
                nodeStack.push(node.childNodes[i]);
            }
        }
    }

    if (!found) {
        // if offset past end, put at end
        range.setStart(el, el.childNodes.length);
        range.collapse(true);
    }

    sel.removeAllRanges();
    sel.addRange(range);
}


function editView(filename, fileContent, newFile=false) {
    terminal.innerHTML = "";

    let saveLine;

    let extension = filename.split(".")[filename.split(".").length-1];

    const title = document.createElement('h1');
    title.classList.add('editViewTitle');
    title.textContent = "Filename: " + filename + (newFile ? " (new file)" : "");
    terminal.appendChild(title);

    const editorContainer = document.createElement('div');
    editorContainer.classList.add('editor-container');
   
    const inputDiv = document.createElement('div');
    inputDiv.classList.add('cli-input-editable');
    inputDiv.contentEditable = true;
    inputDiv.innerText = fileContent;
    // make newlines work: // DOESNT WORK -- NEED fIXXXXXX!!
    //inputDiv.innerText = fileContent.replace(/\\n/g, "\n");
    /// fixed !!!! not needed code above!!!

    editorContainer.appendChild(inputDiv);
    
    terminal.appendChild(editorContainer);
    inputDiv.focus();

    let savePromptShown = false;
    let modified = false;

    async function savePromptListener(event) {
        const key = event.key.toLowerCase();
        if (!savePromptShown) return;

        if (key === 'y') {
            event.preventDefault();
            //commands.write([filename, inputDiv.innerText]);
            // write \n instead of real newlines
            const content = inputDiv.innerText // not needed, dont use :   //.replace(/\n/g, "\\n");
            await commands.write([filename, content]);

            cleanup();
        } else if (key === 'n') {
            event.preventDefault();
            cleanup();
        } else if (key === 'escape') {
            event.preventDefault();
            saveLine.remove();
            inputDiv.contentEditable = true;
            inputDiv.focus();
            savePromptShown = false;
        }
    }

    function cleanup() {
        terminal.innerHTML = "";
        document.removeEventListener('keydown', exitEditViewCtrlXListener);
        document.removeEventListener('keydown', savePromptListener);
        document.removeEventListener('input',callSyntaxHighlight)
        editViewOpened = false;
        modified = false;
        createInputLine();
    }

    function insertTextAtCursor(text) {
        const sel = window.getSelection();
        if (!sel.rangeCount) return;

        const range = sel.getRangeAt(0);
        range.deleteContents();

        const textNode = document.createTextNode(text);
        range.insertNode(textNode);

        // Move caret to end of inserted text
        range.setStartAfter(textNode);
        range.setEndAfter(textNode);

        sel.removeAllRanges();
        sel.addRange(range);
    }

    /**
     * @param {Event} event
     */
    const exitEditViewCtrlXListener = function(event) {
        if (event.ctrlKey && event.key.toLowerCase() === 'x' && editViewOpened) {
            event.preventDefault();

            
            inputDiv.contentEditable = false;

            if(modified){
                saveLine = document.createElement('h2');
                saveLine.textContent = "Save file? Y/N";
                saveLine.classList.add('saveLine');
                terminal.appendChild(saveLine);

                savePromptShown = true;

                document.addEventListener('keydown', savePromptListener);
            } else {
                // if nor modified, cleanup directly
                cleanup();
            }
        }
        
        /* normally this should be here, but its important. otherwise TAB doesnt work */
        if(event.key === "Tab"){
            event.preventDefault();
            const tab = "\t";
            insertTextAtCursor(tab);
        };
    };

    function callSyntaxHighlight(event){
        modified = true; // normally shouldnt be here
        syntaxHighlight(inputDiv, extension);
    }

    document.addEventListener('input', callSyntaxHighlight)

    document.addEventListener('keydown', exitEditViewCtrlXListener);
    //document.addEventListener('keydown', editViewActionsListener);

    // call syntax highlight for the first time
    syntaxHighlight(inputDiv, extension);
}



function moveCursorToEnd(element) {
    const range = document.createRange();
    range.selectNodeContents(element);
    range.collapse(false);
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
}

function getCommonPrefix(strings) {
    if (!strings || strings.length === 0) return '';
    let prefix = strings[0];
    for (let i = 1; i < strings.length; i++) {
        while (strings[i].indexOf(prefix) !== 0) {
            prefix = prefix.substring(0, prefix.length - 1);
            if (prefix === '') return '';
        }
    }
    return prefix;
}

// Ensure input is always focused if the user clicks elsewhere
document.addEventListener('click', (event) => {
    // Only focus if click was outside the input
    if (!event.target.closest('.cli-input-editable')) {
        // Focus the input
        inputDiv.focus();
    }
});

// Initialize the first input line
createInputLine();
