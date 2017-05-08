process.env.DEBUG = 'actions-on-google:*';

const fs = require('fs');
const util = require('util');

const ApiAiAssistant = require('actions-on-google').ApiAiAssistant;
const fetch = require('node-fetch');

// intents
const LIST_TOPICS_INTENT = 'topics.list';
const WELCOME_INTENT = 'input.welcome';
const SPEAKERS_COUNT_INTENT = 'speakers.count';

//helpers
const _debug = (name, what) => {
    fs.writeFileSync(`./logs/${name}-headers.json`, JSON.stringify(what.headers, null, 2));
    fs.writeFileSync(`./logs/${name}-body.json`, JSON.stringify(what.body, null, 2));
}

const _fetchSchedule = () => {
    let schedules = ['thursday', 'friday'].map(day => {
        return fetch(`http://cfp.devoxx.co.uk/api/conferences/DV17/schedules/${day}`)
            .then(rawResponse => rawResponse.text())
            .then(textResponse => JSON.parse(textResponse));
    });

    return Promise.all(schedules)
        .then(data => data.map(d => d.slots))
        .then(slots => [].concat(...slots));
};

const _filter = (schedule, predicat, comparator) => {
    return predicat(schedule, comparator);
};

// Predicates

const byTalkName = (schedule) => {
    return schedule
        .filter(slot => slot.talk)
        .map(slot => slot.talk.title.trim());

};

const byTalkTrack = (schedule) => {
    schedule = schedule
        .filter(slot => slot.talk)
        .map(slot => slot.talk.track.trim().replace('&amp;', 'and'));
    return [
        ...new Set(schedule)
    ];
};

const byTalkType = (schedule) => {
    schedule = schedule
        .filter(slot => slot.talk)
        .map(slot => slot.talk.talkType.trim());
    return [
        ...new Set(schedule)
    ];
};

const byRoom = (schedule) => {
    schedule = schedule
        .filter(slot => slot.talk)
        .map(slot => slot.roomName.trim());
    return [
        ...new Set(schedule)
    ];
};

const bySpeaker = (schedule) => {
    const speakers = schedule
        .filter(slot => slot.talk)
        .map(slot => slot.talk.speakers.map(speaker => speaker.name.trim()).pop())
        .sort();
    return new Set(speakers);
};

const byTopic = (schedule, topic) => {
    const talks = schedule
        .filter(slot => {
            return slot.talk && slot.talk.track.toLowerCase().indexOf(topic.toLowerCase()) !== -1;
        })
    if (talks.length > 0) {
        return talks.map(slot => slot.talk);
    } else {
        return [];
    }
};


// Intents

const listTopicsIntent = (assistant) => {
    _fetchSchedule()
        .then(schedule => _filter(schedule, byTalkTrack))
        .then(topics => {
            assistant.ask(`The covered topics are: ${topics.join(', ')}. 
                            What do you want to learn about?'`);
        })
        .catch(error => assistant.ask(error.toString()));
};

const speakersCountIntent = (assistant) => {
    _fetchSchedule()
        .then(schedule => _filter(schedule, bySpeaker))
        .then(speakers => {
            assistant.ask(`I found ${speakers.length} speakers.`);
        })
        .catch(error => assistant.ask(error.toString()));
};

const talksByTopicsIntent = (assistant) => {
    let topic = assistant.getArgument('topic-name');
    let isNext = assistant.getArgument('date-period');
    topic = topic.toLowerCase().replace('and ', '& ');

    if (topic === '') {
        assistant.ask(`Sorry, I didn't get what topic you were interested in. 
                       Is there another topic you'd like to hear about?`);
    } else {
        _fetchSchedule()
            .then(schedule => _filter(schedule, byTopic, topic))
            .then(talks => {
                const totalSessions = talks.length;
                if (totalSessions === 0) {
                    assistant.ask(`Sorry, I couldn't find any session about ${topic}.
                                   Is there another topic you'd be interested in?`);
                } else {
                    assistant.setContext('find-next-by-topic', 3, {
                        sessionIndex: 0,
                        talkIds: talks.map(talk => talk.id),
                        totalSessions
                    });
                    assistant.ask(`The next session about ${topic} is called ${talks[0].title}.
                                   Would you like to hear more about it or hear about the next session?`);
                }
            })
            .catch(error => {
                console.log(`Error while fetching sessions: ${error}`);

                assistant.tell(`I wasn't able to reach the Devoxx REST API 
                                to list the available sessions about ${topic}.`);
            });
    }
};

const welcomeIntent = (assistant) => {
    assistant.ask(`Welcome to your Devoxx bot! I am Groot!`);
    // I can help you find a talk, list all topics, know more about a workshop or a speaker.
    // What would you like to know?`);
};

exports.devoxx = (request, response) => {
    _debug('request', request);

    const assistant = new ApiAiAssistant({ request, response });
    const actionMap = new Map();
    actionMap.set('input.welcome', welcomeIntent);
    actionMap.set('speakers.count', speakersCountIntent);
    actionMap.set('topics.list', listTopicsIntent);
    actionMap.set('talks.by.topic', talksByTopicsIntent);
    assistant.handleRequest(actionMap);

    _debug('response', response);
};