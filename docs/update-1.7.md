this update is called 1.7 with codename Huckleberry.

main feature is an event manager like n8n or make.com which will allow to create workflows. It will have the following modules:

# Triggers:
## lead
 - new lead created (add lead source filter)
 - lead changed its status (add a filter, for from and to status with the option of any status)
 - new lead timeline event (on Chronological History Timeline)

 ## client 
 - new client created (filter person, or company also add filter to client type)
 
 ## notes
 - new note created
 - note updated
 
 ## tasks
 - new task created (add filter for assigned user)
 - task status change (add filter for old status and new status)
 - task overdue
 
 ## email 
 - new email received (add filter for sender (client or not assigned or not assigned but already got email from the address)
 - new email sent (filter on email addresses)

 ## timer
 - trigger every X minutes or every x-th day for a week or month, or every x-th month... etc.

 ## manual button
 - this will add a button (customize with color and icon, and button style (full, sceleton, icon only)) this will appear in a toolbox on the top. When the toolbox is clicked it will show the array of created manual triggers.

# Tools
 - we need a tool which splits the events, so it will trigger one by one
 - AI Agent Processor - receives the JSON from the previous nodes, sends it to the set up AI Agent (AI agent can be created in the editor settings using skills and must be set up. It can be basic chatbots which returns a JSON but also full pledget AI agents). When this agent is set it will check the next node what data is expected and it will send those instructions to the AI to know what form is required from him. Also it gets prompt what to do.

# Actions
 - Create lead
 - Create task
 - Send email
 - Reply to email
 - Send SMS
 - Create document 
 - Create client


 in the menu add a small node icon with deep purple theme. 