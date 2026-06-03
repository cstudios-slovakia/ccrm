1. create a composer package, which is easy to update using composer update only, and when installed it has an installation wizzard, which asks the user for the db setup. when the db credentials are set, it will prompt an installation of a demo, it will install the demo as it is now with demo data. 
2. when a demo is installed, it will set the system to demo mode. it will appear in the header and in the settings. when clicking the "DEMO" not in the header it will take a user into the settings and there will a button to remove the demo data. and an empty database will be set. when removing the user should be prompted if the lead sources, states should be kept.
3. when demo is installed the quick login should be set as it is now. when there is not set, the quick login should not be there, but a password reset instead for the users
4. the database should be built in a way, the system will be expandable with plugins in the future.
build up the RBAC table according to each function and view.

all the notes from the previous agent can be found in the docs folder.