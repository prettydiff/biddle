# biddle, Documentation

## Commands

### Command Overview
biddle operates with the convention: `biddle command argument1 argument2`

The following table describes which commands require arguments and which commands run locally without a network connection.  A second argument is required for the **copy** command and either optional or unused for all other commands.

Command|Local Only|Argument Type|Second Argument
---|---|---|---
copy|yes|file path or directory path|directory path
get|optional|file path|none
global|yes|none|none
hash|yes|file path|none
help|yes|number|none
install|optional|zip file|directory path
list|yes|"*installed*" or "*published*"|none
markdown|yes|path to markdown file|number
publish|yes|directory path|directory path
remove|yes|file path or directory path|none
status|yes|none or application name|none
test|no|none|none
uninstall|yes|application name|none
unpublish|yes|application name|none
unzip|yes|path to zip file|directory path
zip|yes|file path or directory path|directory path

### cmds Object
Some biddle commands require OS specific actions.  For instance the commands to recursively delete a directory tree, copy a directory tree, or zip a file differ by operating system.  Many of these simple operations are required for the primary publication and installation tasks and are provided directly as a convenience.

These commands are found in the **cmds** object in biddle.js near the top of the file.
