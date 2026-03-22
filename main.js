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

Important information:
- autoload modules: create a file named autoload in directory /modules/<modulename>/
- files of the webos programming language need to start with #wpl to be executable, just like #script for normal scripts

More coming soon!!

Enjoy your experience!
`;
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



/* WEBOSPL COMPILER -> JS */
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
        let js = "";
        const stack = [];

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

            // ===== FALLBACK =====
            js += `${this.indent()}// Unknown: ${line}\n`;
        }

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
}

let woplcompjs = new WOPLCOMPJS();
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

ITER 1 TO 10 WITH I
    !PRINT "Loop: " I
    ITER 1 TO 10 WITH J
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
const js = woplcompjs.compile(ccode);
console.log(js);

// run it
new Function(js)();


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
        { name: "wpl", key: "wpl", classRef: WebOSPLang },
        { name: "gfx", key: "gfx", classRef: Graphics }
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

function base64ToUtf8(base64) {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
    }
    return new TextDecoder().decode(bytes);
}

// CLASS FILESYSTEM
class FS{
    // moving protected files also to localstorage later
    // note: protected files are only checked in remove dir and file function, maybe also checking in write functions
    protectedFiles = [[".filesystem"], ["help.txt"], ["tools"]]; // paths are stored as arrays, so buildPath function doesn't need to be called
    constructor(){
        if(localStorage.getItem("fs") == null){
            localStorage.setItem("fs", JSON.stringify({"root":{"f_.filesystem":""}}));
        }
        try {
            this.filesystem = JSON.parse(localStorage.getItem("fs"));
        } catch (e) {
            console.error("Invalid JSON in localStorage:", e);
            alert("Unrecoverable error: filesystem is corrupted. Press enter to reset.");
            localStorage.setItem("fs", JSON.stringify({"root":{"f_.filesystem":""}}));
            window.location.reload();
            return;
        }
        
        let output = this.readFile([".filesystem"]);
        if(output[1] == false){
            alert("Unrecoverable error: filesystem is corrupted. '.filesystem' file is missing. Press enter to recover!. Error message: "+output[2]);
            output = this.createFile([".filesystem"], "");
            //alert(output[2]);
            window.location.reload();
            return;

        }

        this.createEssentialFiles();
        this.moduleDirInit(); // maybe merge both calls into one init func 
    
    }
    createEssentialFiles(){
        this.createDirectory(["tools"]);
        this.writeFile(["help.txt"], Utils.helpMessage);
        this.writeFile(["tools","repair.run"],"#script\necho Repairing filesystem...\nrmf /.filesystem\ntouch /.filesystem\necho Repair complete!\n");
        this.writeFile(["tools","test.wpl"], "#wpl\n"+code);
    }
    moduleDirInit(){
        // just like in linux /proc, /sys or /dev dir. represents various things in os
        //this.removeDirectory(["modules"]);
        // this dir is for module config
        this.createDirectory(["modules"]);

        //let files = this.listFiles(["modules"])[0];
        //console.log(files);

        Loader.getAllModules().forEach((mod) => {
            console.log("Init mod dir");
            this.createDirectory(["modules",mod]);

            // check for autoload
            // !!!! maybe load modules later
            let files = this.listFiles(["modules",mod])[0];
            if(files.includes("autoload")){
                Loader.loadModule(mod);
            }
            
        });

        // maybe delete any user created unrelated files inside modules/
    }
    getRoot(){
        return this.filesystem["root"];
    }
    // invalid paths need to be handled
    readFile(path) {
        let value = this.getRoot();
    
        for (let i = 0; i < path.length; i++) {
            let key = path[i];
            
            // Determine if we are looking for a file (f_) or directory (d_)
            let prefixedKey = `f_${key}`;  // Default to looking for files
            if (i < path.length - 1) {  // If we're not at the end, we're still looking for directories or files
                prefixedKey = `d_${key}`;  // Assume we're looking for a directory unless it's the last part
            }
    
            // Check if the key exists at this level
            if (value && value.hasOwnProperty(prefixedKey)) {
                value = value[prefixedKey];
                value = base64ToUtf8(value);
                                
                // If it's a directory (d_), and we're at the end of the path, return that it's a directory
                if (prefixedKey.startsWith("d_")) {
                    if (i === path.length - 1) {
                        return ["", false, `${"/"+path.join('/')} is a directory`];
                    }
                    continue;  // Proceed to next part of the path if it's a directory
                }
    
                // If it's a file (f_), and we're at the end of the path, return its content
                if (prefixedKey.startsWith("f_")) {
                    if (i === path.length - 1) {
                        return [value, true, ""];  // Successfully found the file content
                    }
                    continue;  // Proceed to next part of the path if it's a file
                }
            } else {
                // If the key does not exist, return an error message
                return ["", false, `Invalid path: ${"/"+path.join('/')}`];
            }
        }
    
        return ["", false, `Invalid path: ${"/"+path.join('/')}`];  // If no match found
    }
    buildPath(path){
        return path.split("/").filter(item => item);
    }
    // function for checking if path is absolute or relative
    parsePath(path) {
        if (path == undefined || path == null) {
            return cwd;
        } else if (path.startsWith("/")) {
            // Absolute path
            return this.buildPath(path);
        } else {
            // Relative path
            const parts = path.split("/").filter(p => p.length > 0);
            const newPath = [...cwd];
    
            for (const part of parts) {
                if (part === "..") {
                    if (newPath.length > 0) {
                        newPath.pop(); // Go up one directory
                    }
                } else if (part !== ".") {
                    newPath.push(part); // Add normal path part
                }
            }
    
            return newPath;
        }
    }
    updateFS(){
        localStorage.setItem("fs", JSON.stringify(this.filesystem));
    }
    createFile(path, content) {
        let value = this.getRoot();

        for (let i = 0; i < path.length; i++) {
            let key = path[i];
    
            // Determine if we are looking for a file (f_) or directory (d_)
            let prefixedKey = `f_${key}`;  // Default to looking for files
            if (i < path.length - 1) {  // If we're not at the end, we're still looking for directories or files
                prefixedKey = `d_${key}`;  // Assume we're looking for a directory unless it's the last part
            }
    
            // Check if the key exists at this level
            if (value && value.hasOwnProperty(prefixedKey)) {
                value = value[prefixedKey];
                
                // If it's a directory, continue to the next part of the path
                if (prefixedKey.startsWith("d_")) {
                    if (i === path.length - 1) {
                        // If the path ends in a directory, return that it's a directory
                        return ["", false, `${"/"+path.join('/')} is a directory, cannot create file here`];
                    }
                    continue;  // Proceed to next part of the path if it's a directory
                }
    
                // If it's a file, we're trying to create a file where one already exists
                if (prefixedKey.startsWith("f_")) {
                    if (i === path.length - 1) {
                        // The file already exists
                        return ["", false, `File ${"/"+path.join('/')} already exists`];
                    }
                    continue;  // Proceed to next part of the path if it's a file
                }
            } else {
                // If the key does not exist, create the directory or file at this level
                if (prefixedKey.startsWith("d_")) {
                    // If it's a directory, create it as a new object
                    value[prefixedKey] = {};
                    value = value[prefixedKey];
                    //this.updateFS();
                } else if (prefixedKey.startsWith("f_") && i === path.length - 1) {
                    // If it's the last element in the path, create the file with content
                    value[prefixedKey] = content;  // Create the file with content
                    this.updateFS();
                    return [content, true, ""];  // Successfully created the file // why returning content?? AI ?!?
                } else {
                    return ["", false, `Invalid path: ${"/"+path.join('/')}`];
                }
            }
        }
    
        return ["", false, `Invalid path: ${"/"+path.join('/')}`];  // If we get here, it's invalid

    }
    createDirectory(path) {
        let value = this.getRoot();
    
        for (let i = 0; i < path.length; i++) {
            let key = path[i];
            let prefixedKey = `d_${key}`;  // Always creating or checking directories
    
            if (value.hasOwnProperty(prefixedKey)) {
                // If it exists and is a directory, continue
                if (typeof value[prefixedKey] === 'object') {
                    value = value[prefixedKey];
                    continue;
                } else {
                    return ["",false, `${"/"+path.slice(0, i + 1).join('/')} is not a directory`];
                }
            } else {
                // Create directory
                value[prefixedKey] = {};
                value = value[prefixedKey];
            }
        }
    
        this.updateFS();
        return ["",true, ""];  // Successfully created directory
    }
    deleteFile(path, force) {
        let value = this.getRoot();
        let parent = null;
        let lastKey = null;
    
        for (let i = 0; i < path.length; i++) {
            let key = path[i];
            let prefixedKey = i < path.length - 1 ? `d_${key}` : `f_${key}`;  // Use 'd_' for intermediate, 'f_' for final file
    
            if (value && value.hasOwnProperty(prefixedKey)) {
                parent = value;         // Store the parent for deletion
                lastKey = prefixedKey; // Store the key to delete
                value = value[prefixedKey];
    
                if (i < path.length - 1 && !prefixedKey.startsWith("d_")) {
                    return ["",false, `${"/"+path.slice(0, i + 1).join('/')} is not a directory`];
                }
            } else {
                return ["",false, `Path ${"/"+path.join('/')} does not exist`];
            }
        }
        
        // protected check
        const isProtected = this.protectedFiles.some(inner => JSON.stringify(inner) === JSON.stringify(path));

        console.log("Deleting file: ", path);
        console.log("Is protected: ", isProtected);
        console.log("Force delete: ", force);
        // Final check: is this a file?
        if (lastKey && lastKey.startsWith("f_")) /* only delete protected files if force is set */ {
            if(force || !isProtected){
                delete parent[lastKey];
                this.updateFS();
                return ["",true, ""];
            } else {
                return ["",false, `File ${"/"+path.join('/')} is protected and cannot be deleted.`];
            }
        }
    
        return ["",false, `${"/"+path.join('/')} is a directory, not a file`];
    }
    deleteDirectory(path, force) {
        let value = this.getRoot();
        let parent = null;
        let lastKey = null;
    
        for (let i = 0; i < path.length; i++) {
            let key = path[i];
            let prefixedKey = `d_${key}`;  // Always expect directories for rmdir
    
            if (value && value.hasOwnProperty(prefixedKey)) {
                parent = value;
                lastKey = prefixedKey;
                value = value[prefixedKey];
    
                if (typeof value !== 'object') {
                    return ["",false, `${"/"+path.slice(0, i + 1).join('/')} is not a directory`];
                }
            } else {
                return ["",false, `Directory ${"/"+path.join('/')} does not exist`];
            }
        }
    
        // Final check: is it empty?
        /*if (Object.keys(value).length > 0) {
            return ["",false, `Directory ${path.join('/')} is not empty`];
        }*/ // function currently deletes even if not empty, maybe add a check for this later
        
        const isProtected = this.protectedFiles.some(inner => JSON.stringify(inner) === JSON.stringify(path));
        if(force || !isProtected){
            // Safe to delete
            delete parent[lastKey];
            this.updateFS();
            return ["",true, ""];
        } else {
            return ["",false, `Directory ${path.join('/')} is protected and cannot be deleted.`];
        }
    }
    listFiles(path) {
        let value = this.getRoot();
    
        for (let i = 0; i < path.length; i++) {
            let key = path[i];
            let dirKey = `d_${key}`;
    
            if (value.hasOwnProperty(dirKey)) {
                value = value[dirKey];
            } else {
                return [[], false, `Invalid path: ${"/"+path.join('/')}`];
            }
        }
    
        if (typeof value !== 'object' || value === null) {
            return [[], false, `${path.join('/')} is not a directory`];
        }
    
        let entries = Object.keys(value).map(entry => {
            if (entry.startsWith("d_")) return entry.slice(2) + '/'; // Add slash for directory
            if (entry.startsWith("f_")) return entry.slice(2);
            return entry;
        });
    
        return [entries, true, ""];
    }
    readFile(path) {
        let value = this.getRoot();
    
        for (let i = 0; i < path.length; i++) {
            let key = path[i];
            let dirKey = `d_${key}`;
            let fileKey = `f_${key}`;
    
            // If it's the last part of the path
            if (i === path.length - 1) {
                if (value.hasOwnProperty(fileKey)) {
                    let data = base64ToUtf8(value[fileKey]);
                    return [data, true, ""];
                } else if (value.hasOwnProperty(dirKey)) {
                    return ["", false, `${"/"+path.join('/')} is a directory, not a file`];
                } else {
                    return ["", false, `File ${"/"+path.join('/')} does not exist`];
                }
            }
    
            // For intermediate segments, expect only directories
            if (value.hasOwnProperty(dirKey)) {
                value = value[dirKey];
            } else {
                return ["", false, `Invalid path: ${path.join('/')}`];
            }
        }
    
        return ["", false, `File ${"/"+path.join('/')} does not exist`]; // fallback
    }
    // similar to createFile, maybe merge them or remove support for adding content to files in createFile
    writeFile(path, content) {
        let value = this.getRoot();
        
        // encode content: better for storing as json
        /// FOR NOW IN BASE64, later we'll add custom encoding for less overhead
        content = utf8ToBase64(content);

        for (let i = 0; i < path.length; i++) {
            let key = path[i];
            let dirKey = `d_${key}`;
            let fileKey = `f_${key}`;
    
            // If it's the last part of the path (the file name)
            if (i === path.length - 1) {
                if (value.hasOwnProperty(dirKey)) {
                    return ["",false, `${"/"+path.join('/')} is a directory, not a file`];
                }
    
                // Write or create the file
                value[fileKey] = content;
                this.updateFS();
                return [true, ""];
            }
    
            // Intermediate path segments must be directories
            if (value.hasOwnProperty(dirKey)) {
                value = value[dirKey];
            } else {
                return ["",false, `Invalid path: ${"/"+path.slice(0, i + 1).join('/')}`];
            }
        }
    
        return ["",false, `Unexpected error writing to ${"/"+path.join('/')}`]; // fallback
    }
    movePath(srcPath, destPath) {
        let root = this.getRoot();
    
        // Handle the case where destination is the root (empty array)
        if (destPath.length === 0) {
            destPath = [];  // Destination is the root
        }

        if (JSON.stringify(srcPath) === JSON.stringify(destPath)) {
            return ["", false, "Source and destination paths are the same!"];
        }
    
        // Navigate to source parent
        let srcParent = root;
        for (let i = 0; i < srcPath.length - 1; i++) {
            let dirKey = `d_${srcPath[i]}`;
            if (srcParent.hasOwnProperty(dirKey)) {
                srcParent = srcParent[dirKey];
            } else {
                return ["",false, `Invalid source path: /${srcPath.slice(0, i + 1).join('/')}`];
            }
        }
    
        let srcName = srcPath[srcPath.length - 1];
        let srcFileKey = `f_${srcName}`;
        let srcDirKey = `d_${srcName}`;
    
        let isFile = srcParent.hasOwnProperty(srcFileKey);
        let isDir = srcParent.hasOwnProperty(srcDirKey);
    
        if (!isFile && !isDir) {
            return ["",false, `Source not found: /${srcPath.join('/')}`];
        }
    
        // Navigate to destination parent
        let destParent = root;
        if (destPath.length > 0) {  // If it's not the root directory
            for (let i = 0; i < destPath.length - 1; i++) {
                let dirKey = `d_${destPath[i]}`;
                if (destParent.hasOwnProperty(dirKey)) {
                    destParent = destParent[dirKey];
                } else {
                    return ["",false, `Invalid destination path: /${destPath.slice(0, i + 1).join('/')}`];
                }
            }
        }
    
        let destName = destPath[destPath.length - 1];
        let destDirKey = `d_${destName}`;
        let destFileKey = `f_${destName}`;
    
        // Case: destination is an existing directory → move inside it
        if (destParent.hasOwnProperty(destDirKey)) {
            let destDir = destParent[destDirKey];
            let targetKey = isFile ? `f_${srcName}` : `d_${srcName}`;
            if (destDir.hasOwnProperty(targetKey)) {
                return ["",false, `Destination already contains /${srcName}`];
            }
            destDir[targetKey] = isFile ? srcParent[srcFileKey] : srcParent[srcDirKey];
            if (isFile) delete srcParent[srcFileKey];
            else delete srcParent[srcDirKey];
            this.updateFS();
            return ["",true, "File moved successfully!"];
        }
    
        // Case: destination is the root directory (destPath is empty)
        if (destPath.length === 0) {
            if (isFile) {
                root[`f_${srcName}`] = srcParent[srcFileKey];
                delete srcParent[srcFileKey];
            } else {
                root[`d_${srcName}`] = srcParent[srcDirKey];
                delete srcParent[srcDirKey];
            }
            this.updateFS();
            return ["",true, "File moved successfully to root!"];
        }
    
        // Case: destination is new file or directory name (rename)
        if (isFile) {
            destParent[`f_${destName}`] = srcParent[srcFileKey];
            delete srcParent[srcFileKey];
        } else {
            destParent[`d_${destName}`] = srcParent[srcDirKey];
            delete srcParent[srcDirKey];
        }
    
        this.updateFS();
        return ["",true, "File moved successfully!"];
    }
    copyPath(srcPath, destPath) {
        let root = this.getRoot();
    
        // Handle the case where destination is the root (empty array)
        if (destPath.length === 0) {
            destPath = [];  // Destination is the root
        }
    
        if (JSON.stringify(srcPath) === JSON.stringify(destPath)) {
            return ["", false, "Source and destination paths are the same!"];
        }
    
        // Navigate to source parent
        let srcParent = root;
        for (let i = 0; i < srcPath.length - 1; i++) {
            let dirKey = `d_${srcPath[i]}`;
            if (srcParent.hasOwnProperty(dirKey)) {
                srcParent = srcParent[dirKey];
            } else {
                return ["", false, `Invalid source path: /${srcPath.slice(0, i + 1).join('/')}`];
            }
        }
    
        let srcName = srcPath[srcPath.length - 1];
        let srcFileKey = `f_${srcName}`;
        let srcDirKey = `d_${srcName}`;
    
        let isFile = srcParent.hasOwnProperty(srcFileKey);
        let isDir = srcParent.hasOwnProperty(srcDirKey);
    
        if (!isFile && !isDir) {
            return ["", false, `Source not found: /${srcPath.join('/')}`];
        }
    
        // Navigate to destination parent
        let destParent = root;
        if (destPath.length > 0) {  // If it's not the root directory
            for (let i = 0; i < destPath.length - 1; i++) {
                let dirKey = `d_${destPath[i]}`;
                if (destParent.hasOwnProperty(dirKey)) {
                    destParent = destParent[dirKey];
                } else {
                    return ["", false, `Invalid destination path: /${destPath.slice(0, i + 1).join('/')}`];
                }
            }
        }
    
        let destName = destPath[destPath.length - 1];
        let destDirKey = `d_${destName}`;
        let destFileKey = `f_${destName}`;
    
        // Case: destination is an existing directory → copy inside it
        if (destParent.hasOwnProperty(destDirKey)) {
            let destDir = destParent[destDirKey];
            let targetKey = isFile ? `f_${srcName}` : `d_${srcName}`;
            if (destDir.hasOwnProperty(targetKey)) {
                return ["", false, `Destination already contains /${srcName}`];
            }
    
            // Copy file or directory
            if (isFile) {
                // For files, copy the content directly (not as an object)
                destDir[targetKey] = srcParent[srcFileKey];
            } else {
                // For directories, do a deep copy
                destDir[targetKey] = JSON.parse(JSON.stringify(srcParent[srcDirKey]));
            }
            this.updateFS();
            return ["", true, "File copied successfully!"];
        }
    
        // Case: destination is the root directory (destPath is empty)
        if (destPath.length === 0) {
            if (isFile) {
                root[`f_${srcName}`] = srcParent[srcFileKey]; // Copy the file content directly
            } else {
                root[`d_${srcName}`] = JSON.parse(JSON.stringify(srcParent[srcDirKey])); // Deep copy directory
            }
            this.updateFS();
            return ["", true, "File copied successfully to root!"];
        }
    
        // Case: destination is new file or directory name (rename)
        if (isFile) {
            destParent[`f_${destName}`] = srcParent[srcFileKey]; // Copy file content directly
        } else {
            destParent[`d_${destName}`] = JSON.parse(JSON.stringify(srcParent[srcDirKey])); // Deep copy directory
        }
    
        this.updateFS();
        return ["", true, "File copied successfully!"];
    }
    
    
    
}


class OsCalls{
    // kernel panic for mssinh filesystem module
    panicMessage10FS = "Kernel panic. Filesystem module not loaded! Auto reboot in 10s";
    // fixed:
    // :/ ls command can only be used to list in directories but not on files, maybe this will be changed in the future. but this also requires changing the cd function then if listFiles changes to also list files, because cd function depends on it, maybe function related callsbacks as 4th argument for return value?
    // file operation os calls are used to parse the full path which is then passed to the FS class which reads/writes content from/to the file with abs path
    listfiles(path){
        console.log("Listing files in path: ", path);

        if(!this.probeFSModule()){
            this.panic10();
            return ["", false, this.panicMessage10FS]
        }
        
        let parsed_path = filesystem.parsePath(path);
        let output = filesystem.listFiles(parsed_path);
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
    createFile(path, content){
        console.log("Creating file");

        if(!this.probeFSModule()){
            this.panic10();
            return ["", false, this.panicMessage10FS]
        }
        
        let parsed_path = filesystem.parsePath(path);
        let output = filesystem.createFile(parsed_path, content); // need to be modified to list current dir if cwd and cd is implemented
        if(output[1] == false){
            return ["", false, output[2]];
        } else {
            return [output[0], true, ""];
        }
    }
    deleteFile(path, force){
        console.log("Deleting file");

        if(!this.probeFSModule()){
            this.panic10();
            return ["", false, this.panicMessage10FS]
        }
        
        let parsed_path = filesystem.parsePath(path);
        let output = filesystem.deleteFile(parsed_path, force); // need to be modified to list current dir if cwd and cd is implemented
        if(output[1] == false){
            return ["", false, output[2]];
        } else {
            return [output[0], true, ""];
        }
    }
    createDir(path){
        console.log("Creating directory");

        if(!this.probeFSModule()){
            this.panic10();
            return ["", false, this.panicMessage10FS]
        }

        let parsed_path = filesystem.parsePath(path);
        let output = filesystem.createDirectory(parsed_path);
        if(output[1] == false){
            return ["", false, output[2]];
        } else {
            return [output[0], true, ""];
        }
    }
    deleteDir(path, force){
        console.log("Deleting directory");

        if(!this.probeFSModule()){
            this.panic10();
            return ["", false, this.panicMessage10FS]
        }

        let parsed_path = filesystem.parsePath(path);
        let output = filesystem.deleteDirectory(parsed_path, force);
        if(output[1] == false){
            return ["", false, output[2]];
        } else {
            return [output[0], true, ""];
        }
    }
    readFile(path){
        console.log("Reading file");

        if(!this.probeFSModule()){
            this.panic10();
            return ["", false, this.panicMessage10FS]
        }

        let parsed_path = filesystem.parsePath(path);
        let output = filesystem.readFile(parsed_path);
        if(output[1] == false){
            return ["", false, output[2]];
        } else {
            return [output[0], true, ""];
        }
    }
    // similar to createFile, maybe merge them or remove support for adding content to files in createFile
    writeFile(path, content){
        console.log("Writing file");

        if(!this.probeFSModule()){
            this.panic10();
            return ["", false, this.panicMessage10FS]
        }

        let parsed_path = filesystem.parsePath(path);
        let output = filesystem.writeFile(parsed_path, content.replace(/\\n/g, "\n"));
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
    movePath(srcPath, destPath) {

        if(!this.probeFSModule()){
            this.panic10();
            return ["", false, this.panicMessage10FS]
        }

        let parsed_srcPath = filesystem.parsePath(srcPath);
        let parsed_destPath = filesystem.parsePath(destPath);
        console.log('Source Path:', parsed_srcPath);
        console.log('Destination Path:', parsed_destPath);
        let output = filesystem.movePath(parsed_srcPath, parsed_destPath);
        if (output[1] == false) {
            return ["", false, output[2]];
        } else {
            return [output[0], true, ""];
        }
    }
    copyPath(srcPath, destPath) {

        if(!this.probeFSModule()){
            this.panic10();
            return ["", false, this.panicMessage10FS]
        }

        let parsed_srcPath = filesystem.parsePath(srcPath);
        let parsed_destPath = filesystem.parsePath(destPath);
        console.log('Source Path:', parsed_srcPath);
        console.log('Destination Path:', parsed_destPath);
        let output = filesystem.copyPath(parsed_srcPath, parsed_destPath);
        if (output[1] == false) {
            return ["", false, output[2]];
        } else {
            return [output[0], true, ""];
        }
    }

    // ntb implemented: add autoload command (+ e.g.:unautoload)
    autoLoadMod(modname){
        console.log("Autoload module");

        if(!this.probeFSModule()){
            this.panic10();
            return ["", false, this.panicMessage10FS]
        }
        
        if(!Loader.getAllModules().includes(modname)){
            return ["", false, "Module doesn't exist"];
        }
        
        let parsedPath = filesystem.parsePath("/modules/"+modname+"/autoload");
        let output = filesystem.createFile(parsedPath, "");
        // fails if file already exists so just ignore error

        //if(output[1] == false){
        //    return ["", false, "Autoload failed!: "+output[2]];
        //} else {
            return ["Autoload successfully enabled for module: "+modname, true, ""];
        //}
    }

    unAutoLoadMod(modname){
        console.log("Autoload module");

        if(!this.probeFSModule()){
            this.panic10();
            return ["", false, this.panicMessage10FS]
        }
        
        if(!Loader.getAllModules().includes(modname)){
            return ["", false, "Module doesn't exist"];
        }
        
        let parsedPath = filesystem.parsePath("/modules/"+modname+"/autoload");
        let output = filesystem.deleteFile(parsedPath, true);

        return ["Autoload disabled for module: "+modname, true, ""];
    }

}

/* GLOBAL VAR FOR HOLDING CANCEL FUNC OF CUR COMMAND */
let cancelFunction = undefined;

class Commands{
    ls(args){
        let output = OS.listfiles(args[0]); // first arg is path
        if(output[1] == false){
            return [output[2], "red", ""];
        } else {
            return [output[0], "green", ""];
        }

    }

    cd(args){

        if(!OS.probeFSModule()){
            OS.panic10();
            return ["", false, OS.panicMessage10FS]
        }

        // normally filesystem class function should only be called from OsCalls class (Kernel)
        let parsed_path = OS.parsePathWrapper(args[0]);
        let output = filesystem.listFiles(parsed_path);
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
    touch(args){
        let output = OS.createFile(args[0],"");
        if(output[1] == false){
            return [output[2], "red", ""];
        } else {
            return ["File created successfully!", "green", ""];
        }
    }
    rm(args, force=false){
        if (args.length === 0) {
            return ["Usage: rm <files>", "yellow", ""];
        }

        let outputMessage = '';  // Initialize an empty string to store messages

        args.forEach(file => {
            const result = OS.deleteFile(file,force);
            
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
    rmf(args){
        if(args.length === 0){
            return ["Usage: rmf <files>", "yellow", ""];
        }
        return this.rm(args, true);
    }
    pwd(args){
        // cwdPath should be used here, because it is the current path
        return ["Current directory => "+cwdPath, "green", ""];
    }
    mkdir(args){
        let output = OS.createDir(args[0]);
        if(output[1] == false){
            return [output[2], "red", ""];
        } else {
            return ["Directory created successfully!", "green", ""];
        }
    }
    rmdir(args, force=false) {
        if (args.length === 0) {
            return ["Usage: rmdir <dirs>", "yellow", ""];
        }
    
        let outputMessage = '';  // Initialize an empty string to store messages
    
        args.forEach(dir => {
            const result = OS.deleteDir(dir, force);
            
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
    rmdirf(args){
        if(args.length === 0){
            return ["Usage: rmdirf <dirs>", "yellow", ""];
        }
        return this.rmdir(args, true);
    }
    cat(args){
        // this should read the file and return the content
        let output = OS.readFile(args[0]);
        if(output[1] == false){
            return [output[2], "red", ""];
        } else {
            return [output[0], "green", ""];
        }
    }
    write(args){
        // this should write the file and return the content
        if (!args[0] || args.length < 2) {
            return ["Usage: write <filename> <content>", "yellow", ""];
        }
        
        let filename = args[0];
        let content = args.slice(1).join(" "); // combine all other args as content
        //console.log("Writing to file: ", filename, " with content: ", content);

        let exists = OS.listfiles(args[0]);
        if(exists[1] == true){
            return ["Cannot write to a directory!", "red", ""];
        }
        
        let output = OS.writeFile(filename, content);
        
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
    mv(args){
        // this should move the file and return the content
        if (args.length < 2) {
            return ["Usage: mv <source> <destination>", "yellow", ""];
        }
        
        let src = args[0];
        let dest = args[1];
        
        let output = OS.movePath(src, dest);
        
        if (output[1] == false) {
            return [output[2], "red", ""];
        } else {
            return ["File moved successfully!", "green", ""];
        }
    }
    cp(args){
        // this should copy the file and return the content
        if (args.length < 2) {
            return ["Usage: cp <source> <destination>", "yellow", ""];
        }
        
        let src = args[0];
        let dest = args[1];
        
        let output = OS.copyPath(src, dest);
        
        if (output[1] == false) {
            return [output[2], "red", ""];
        } else {
            return ["File copied successfully!", "green", ""];
        }
    }
    exist(args) {
        if (!args[0]) {
            return ["Usage: exist <path>", "yellow", ""];
        }
    
        // Check if it's a file
        let output = OS.readFile(args[0]);
        if (output[1]) {
            return ["true", "green", ""];
        }
    
        // Check if it's a directory
        output = OS.listfiles(args[0]);
        if (output[1]) {
            return ["true", "green", ""];
        }
    
        return ["false", "green", ""];
    }
    append(args){
        // this should write the file and return the content
        if (!args[0] || args.length < 2) {
            return ["Usage: append <filename> <content>", "yellow", ""];
        }
        
        let filename = args[0];
        let content = args.slice(1).join(" "); // combine all other args as content
        //console.log("Writing to file: ", filename, " with content: ", content);

        let exists = OS.readFile(args[0]);
        if(exists[1] == false){
            return [exists[2], "red", ""];
        }

        let curContent = OS.readFile(filename);
        
        let output = OS.writeFile(filename, curContent[0]+content);
        
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
        let output = OS.readFile(filename);

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
    edit(args){
        // this should open the file in edit mode
        if (!args[0]) {
            return ["Usage: edit <filename>", "yellow", ""];
        }
        let filename = args[0];
        let parsed_filename = filesystem.parsePath(filename)
        let output = OS.readFile(filename);
        // check if direcory, if it is, this returns true, so dont continue, if target doesnt exist at all, thenn readFile fails
        let entries = filesystem.listFiles(parsed_filename);

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
    async wpl(args) {
        if (!Modules.wpl) {
            return ["wpl module not loaded (need: wpl)", "red", ""];
        }
        if (!args[0]) {
            return ["Usage: wpl <filename>", "yellow", ""];
        }
        let filename = args[0];
        let output = OS.readFile(filename);

        if (output[1] == false) {
            return [output[2], "red", ""];
        }

        // executable files in webos pl need to have '#wpl' in the first line
        if(output[0].split("\n")[0] !== "#wpl"){
            return ["File is not executable!", "red", ""];
        }

        let wplcode = output[0].slice(1);
        
        // for now execute directly
        let wplout = await Modules.wpl.run(wplcode, true);

        console.log(wplout);

        if(!Modules.wpl.error){
            // output already done directly inside interpreter
            return ["File executed successfully!"/*wplout*/, "green", ""];
        } else {
            return ["File executed with errors!", "red", ""];
        }
    }

    autoload(args){
        // mdoule loader
        if (!args[0]) {
            return ["Usage: autoload <module>", "yellow", ""];
        }

        let output = OS.autoLoadMod(args[0]);
        console.log(output);
        if(output[1] == false){
            return [output[2], "red", ""];
        } else {
            return [output[0], "green", ""];
        }
    }
    unautoload(args){
        // mdoule loader
        if (!args[0]) {
            return ["Usage: unautoload <module>", "yellow", ""];
        }

        let output = OS.unAutoLoadMod(args[0]);
        if(output[1] == false){
            return [output[2], "red", ""];
        } else {
            return [output[0], "green", ""];
        }
    }
    // ...
}

let filesystem = new FS();
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
            wpl: commands.wpl,
            autoload: commands.autoload,
            unautoload: commands.unautoload
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
    let curCmdAutoCompletIndex = 0;
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
                } else {
                    // file/folder completion
                    const [entries, ok] = filesystem.listFiles(cwd);
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
        "LET","PRINT","INPUT", "FUNCTION ","PARAM","RETURN","START",
        "APPEND ","REMOVE ", "END","CALL","WITH","IF","ELSE","THEN",
        "EXEC","ITER"," TO ", "WHILE ", " STEP ", "BREAK", "CONTINUE",
        " INDEX ", " FROM ", " AT ", "SET ", "FIND ", " IN ", "LENGTH ",
        "LIST", "CLEAR ", " ALL "
      ],
    }
};


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

    editorContainer.appendChild(inputDiv);
    
    terminal.appendChild(editorContainer);
    inputDiv.focus();

    let savePromptShown = false;
    let modified = false;

    function savePromptListener(event) {
        const key = event.key.toLowerCase();
        if (!savePromptShown) return;

        if (key === 'y') {
            event.preventDefault();
            commands.write([filename, inputDiv.innerText]);

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
