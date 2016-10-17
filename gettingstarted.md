# biddle, Getting Started

## Getting set up
1. First thing is to get a copy of biddle, so let's download from Github
    git clone git@github.com:prettydiff/biddle.git
    cd biddle
2. Let's add biddle to the system path so that we can run it from any directory on the file system.
    node biddle global

## Publish an application
1. We need to publish an application to have something to play with. Biddle comes with two mock applications for running tests, so will use one of those.
    biddle publish test/biddletesta
2. When we publish a new application a directory reflective of the application's name is written to the default location, which is the provided *publications* directory.  Let's move into this published application directory to see what we have.
    cd publications/biddletesta
3. You should see the following list of files:
  * biddletesta_99.99.1234.hash
  * biddletesta_99.99.1234.zip
  * biddletesta_latest.hash
  * biddletesta_latest.zip
  * biddletesta_min_99.99.1234.hash
  * biddletesta_min_99.99.1234.zip
  * biddletesta_min_latest.hash
  * biddletesta_min_latest.zip
  * biddletesta_prod_99.99.1234.hash
  * biddletesta_prod_99.99.1234.zip
  * biddletesta_prod_latest.hash
  * biddletesta_prod_latest.zip
  * latest.txt

## A brief explanation of publish
1. By default the **publish** command will generate five files with the convention myAppName_version.zip, myAppName_version.hash, myAppName_latest.zip, myAppName_latest.hash, and latest.txt.  For every zip file created a hash file is created with the same file name.  If the version is the first publication or later than prior publications the files with *latest* (intead of *version*) are written.  The latest named files are created as a convenience for users who want access to the newest updates without having to keep track of version details.  Finally, the file *latest.txt* is written if the version is the latest version, which contains the version string.  The *latest.txt* file is necessary for the **status** command.
2. If by default the **publish** command writes 5 files then what are all those other files in the biddletesta directory?  biddle supports a convention called *variants* where different forms of an application can be generated.  These instructions are provided in the application's package.json file.  See [package.json](package.md) for more information.

## Install an application
1. Now that an application is published let's install from it.
    biddle install publications/biddletesta/biddletesta_latest.zip
2. Install will to see if the provided path starts with *http* or *https* and if so will download the zip (and its hash file) from the internet.  If not the **install** command will assume the path is to a file stored on the local file system and attempt to resolve the local path.
3. Between getting the zip file and unzipping its contents biddle will run a hash of the file and compare it to the hash sequence provided in the requested hash file.  If the hashes are a match the application is unzipped and installed.  If the hashes don't match the zip file is stored in biddle's *downloads* directory so that the user can decide the next course of action.

## List applications
1. It is handy to know what applications are present, so let's generate a list of installed applications.
    biddle list installed
2. We can also list the published applications.
    biddle list published
3. Sometimes it is just more convenient to get a list of both the installed and published applications.
    biddle list

## Check application status
1. We know the application is the latest version because its a dummy application it hasn't been modified, but bear with me.  Let's check the status anyways.
    biddle status biddletesta
2. If there were multiple applications installed we could get a complete status list by excluding the application name.
    biddle status

## Uninstall an application
1. Our quick tour is coming to an end, so let's clean up our installed application.
    biddle uninstall biddletesta
2. To uninstall an application only the application name is necessary.  biddle knows where the application was installed, even if a custom installation location was specified.
3. The application directory is deleted and the application is deleted from the *installed.json* file, which is the source of truth for all installed applications.

## Unpublish an application
1. These steps will read like deja vu following the uninstall process.
    biddle unpublish biddletesta
2. The unpublish command will delete the published application directory and delete the concerned data from the *published.json* file.
