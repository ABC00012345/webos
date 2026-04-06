
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
        this.wplModDIrInit();
        this.binDirInit();
    
    }
    createEssentialFiles(){
        this.createDirectory(["tools"]);
        this.writeFile(["help.txt"], Utils.helpMessage);
        this.writeFile(["tools","repair.run"],"#script\necho Repairing filesystem...\nrmf /.filesystem\ntouch /.filesystem\necho Repair complete!\n");
        this.writeFile(["tools","test.wpl"], "#wpl\n"+code);
    }
    wplModDIrInit(){
        this.createDirectory(["wpl"]);

        // create the baisc wpl modules like date, gfx, random, ...
        // if you import them they just call EXEC load ...
        this.writeFile(["wpl","gfx.wpl"], "#wpl\nEXEC load gfx\n");
        //this.writeFile(["wpl","audio.wpl"], "#wpl\nEXEC load audio\n");
        this.writeFile(["wpl","date.wpl"], "#wpl\nEXEC load date\n");
    
        // later this will be real modules e.g. random module for wpl has functions for generating nums
        // big modules are stored in Utils class
        for(const mod in Utils.wplModules){
            this.writeFile(["wpl",mod], Utils.wplModules[mod]);
        }
    }
    
    binDirInit(){
        this.createDirectory(["bin"]);

        for(const cmd in Utils.wplCommands){
            this.writeFile(["bin",cmd], Utils.wplCommands[cmd]);
        }
        // this directory will contain commands that are written in wpl

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
    /*readFile(path) {
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
    }*/
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
                    value[prefixedKey] = bytesToBase64(normalizeToBytes(content)); // encode bytes instead (supports now binary + normal files) //utf8ToBase64(content);  // Create the file with content
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
    readFile(path, raw=false) {
        let value = this.getRoot();
    
        for (let i = 0; i < path.length; i++) {
            let key = path[i];
            let dirKey = `d_${key}`;
            let fileKey = `f_${key}`;
    
            // If it's the last part of the path
            if (i === path.length - 1) {
                if (value.hasOwnProperty(fileKey)) {
                    let data = raw ? base64ToBytes(value[fileKey]) : base64ToUtf8(value[fileKey]);
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
        content = bytesToBase64(normalizeToBytes(content)); // encode bytes instead (supports now binary + normal files) //utf8ToBase64(content);

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