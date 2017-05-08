process.env.DEBUG = 'actions-on-google:*';

const fs = require('fs');
const ApiAiAssistant = require('actions-on-google').ApiAiAssistant;
const fetch = require('node-fetch');

// intents
const LIST_TOPICS_INTENT = 'topics.list';
const WELCOME_INTENT = 'input.welcome';
const SPEAKERS_COUNT_INTENT = 'speakers.count';
const TALK_CONTEXT = 'talk-context';

let __CACHE = [];

//helpers

const helpers = {
    debug() {
        (name, what) => {
            fs.writeFileSync(`./logs/${name}-headers.json`, JSON.stringify(what.headers, null, 2));
            fs.writeFileSync(`./logs/${name}-body.json`, JSON.stringify(what.body, null, 2));
        }
    },
    fetchSchedule() {
        if (__CACHE.length > 0) {
            return Promise.resolve(__CACHE);
        }

        let schedules = ['thursday', 'friday'].map(day => {
            return fetch(`http://cfp.devoxx.co.uk/api/conferences/DV17/schedules/${day}`)
                .then(rawResponse => rawResponse.text())
                .then(textResponse => JSON.parse(textResponse));
        });

        // run once!
        return Promise.all(schedules)
            .then(data => data.map(d => d.slots))
            .then(slots => {
                __CACHE = [].concat(...slots);
                return __CACHE;
            });
    },
    filter(schedule, predicat, comparator) {
        return predicat(schedule, comparator);
    }
};

// Predicates

const predicates = {
    byTalkId(schedule, id) {
        return schedule
            .filter(slot => slot.talk && slot.talk.id === id)
            .pop();
    },
    byTalkName(schedule) {
        return schedule
            .filter(slot => slot.talk)
            .map(slot => slot.talk.title.trim());

    },
    byTalkTrack(schedule) {
        schedule = schedule
            .filter(slot => slot.talk)
            .map(slot => slot.talk.track.trim().replace('&amp;', 'and'));
        return [
            ...new Set(schedule)
        ];
    },
    byTalkType(schedule) {
        schedule = schedule
            .filter(slot => slot.talk)
            .map(slot => slot.talk.talkType.trim());
        return [
            ...new Set(schedule)
        ];
    },
    byRoom(schedule) {
        schedule = schedule
            .filter(slot => slot.talk)
            .map(slot => slot.roomName.trim());
        return [
            ...new Set(schedule)
        ];
    },
    bySpeaker(schedule) {
        const speakers = schedule
            .filter(slot => slot.talk)
            .map(slot => slot.talk.speakers.map(speaker => speaker.name.trim()).pop())
            .sort();
        return new Set(speakers);
    },
    byTopic(schedule, topic) {
        const talks = schedule
            .filter(slot => {
                return slot.talk && slot.talk.track.toLowerCase().indexOf(topic.toLowerCase()) !== -1;
            })
        if (talks.length > 0) {
            return talks.map(slot => slot.talk);
        } else {
            return [];
        }
    }
};

// Intents
const intents = {
    welcome(assistant) {
        assistant.ask(`I am Groot!`);
        // Welcome to your Devoxx bot! I can help you find a talk, list all topics, know more about a workshop or a speaker.
        // What would you like to know?`);
    },
    listTopics(assistant) {
        helpers.fetchSchedule()
            .then(schedule => helpers.filter(schedule, predicates.byTalkTrack))
            .then(topics => {
                assistant.ask(`The covered topics are: ${topics.join(', ')}. 
                            What do you want to learn about?'`);
            })
            .catch(error => {
                console.log(`Error while fetching sessions: ${error}`);
                assistant.tell(`I wasn't able to reach the Devoxx REST API 
                                to list the available topics.`);
            });
    },
    speakersCount(assistant) {
        helpers.fetchSchedule()
            .then(schedule => helpers.filter(schedule, predicates.bySpeaker))
            .then(speakers => {
                assistant.ask(`I found ${speakers.length} speakers.`);
            })
            .catch(error => {
                console.log(`Error while fetching sessions: ${error}`);
                assistant.tell(`I wasn't able to reach the Devoxx REST API 
                                to count the speakers.`);
            });
    },
    talksByTopics(assistant) {
        let topic = assistant.getArgument('topic-name');
        let isNext = assistant.getArgument('date-period');
        topic = topic.toLowerCase().replace('and ', '& ');

        if (topic === '') {
            assistant.ask(`Sorry, I didn't get what topic you were interested in. 
                       Is there another topic you'd like to hear about?`);
        } else {
            helpers.fetchSchedule()
                .then(schedule => helpers.filter(schedule, predicates.byTopic, topic))
                .then(talks => {
                    const totalSessions = talks.length;
                    if (totalSessions === 0) {
                        assistant.ask(`Sorry, I couldn't find any session about ${topic}.
                                   Is there another topic you'd be interested in?`);
                    } else {
                        assistant.setContext(TALK_CONTEXT, 3, {
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
    },
    moreOnATalk(assistant) {
        let contexts = assistant.getContexts();
        let context = contexts.filter(value => value.name === TALK_CONTEXT)[0];
        let sessionIndex = context.parameters.sessionIndex;
        let talkIds = context.parameters.talkIds;
        let currentTalkId = talkIds[sessionIndex];

        helpers.fetchSchedule()
            .then(schedule => helpers.filter(schedule, predicates.byTalkId, currentTalkId))
            .then(slot => {
                const amPm = +slot.fromTime.split(':')[0] > 12 ? 'PM' : 'AM';
                const time = `${slot.fromTime} ${amPm}`;

                assistant.ask(`Sure, here is more information! 
                   The presentation starts at ${time}, in ${slot.roomName}. 
                   The abstract says: ${slot.talk.summary}. 
                   Would you like to hear about the next session?`);
            })
            .catch(error => {
                console.log(`Error while fetching sessions: ${error}`);
                assistant.tell(`I wasn't able to reach the Devoxx REST API 
                                to list the available sessions about ${topic}.`);
            });
    }
};

exports.devoxx = (request, response) => {
    helpers.debug('request', request);

    const assistant = new ApiAiAssistant({ request, response });
    const actionMap = new Map();
    actionMap.set('input.welcome', intents.welcome);
    actionMap.set('speakers.count', intents.speakersCount);
    actionMap.set('topics.list', intents.listTopics);
    actionMap.set('talks.by.topic', intents.talksByTopics);
    actionMap.set('talks.more', intents.moreOnATalk);
    assistant.handleRequest(actionMap);

    helpers.debug('response', response);
};