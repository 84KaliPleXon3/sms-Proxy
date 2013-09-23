# SMS Proxy

A simple example of proxying user's phone numbers through a common virtual 
number. Useful when connecting users without a prior relationship (discussing a 
sale, questions about a listing, etc).

## Requirements

- NodeJS

## Setup

    NEXMO_KEY=your-key NEXMO_SECRET=your-secret NEXMO_FROM=inbound-number ./proxy.js 

Then point your [Nexmo number to your server][3] (edit proxy.js for host / port).

*For local develpoment [Forward][1], or [Runscope's Passageway][2] make it easy
to make your server reachable by Nexmo.*

## Usage

SMS an email address to your Nexmo number to start a chat. If no one else is 
ready, you'll just wait for another user. When you're done, SMS #end to close 
the chat.

Both users will be sending message to / receiving message from the Nexmo number, 
so their personal number will not be revealed.

While users are chatting, you can view the connections and see a log of the 
messages in your web browser (visit the same URL used for inbound messages).


[1]: https://forwardhq.com/
[2]: https://www.runscope.com/docs/passageway
[3]: https://dashboard.nexmo.com/private/numbers
