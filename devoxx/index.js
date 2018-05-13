const fs = require('fs');
const ApiAiAssistant = require('actions-on-google').ApiAiAssistant;
const fetch = require('node-fetch');
let __CACHE = [];

//Helpers

const Helpers = {
    debug() {
        (name, what) => {
            fs.writeFileSync(`./logs/${name}-headers.json`, JSON.stringify(what.headers, null, 2));
            fs.writeFileSync(`./logs/${name}-body.json`, JSON.stringify(what.body, null, 2));
        }
    },
    dayToPhrase(slotDay) {
        const now = new Date();
        const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
        const todayIndex = now.getDay();
        const todayName = days[todayIndex];
        if (slotDay === todayName) {
            return `is today`;
        } else {
            const slotIndex = days.indexOf(slotDay);
            const oneDayDistance = Math.abs((slotIndex - todayIndex)) === 1;
            if (slotIndex < todayIndex) {
                if (oneDayDistance) {
                    return 'was given yesterday';
                } else {
                    return `was given on last ${days[ slotIndex ]}`;
                }
            } else {
                if (oneDayDistance) {
                    return 'is tomorrow';
                } else {
                    return `is next ${days[ slotIndex ]}`;
                }
            }
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

        // run once and cache the result
        return Promise.all(schedules)
            .then(data => data.map(d => d.slots))
            .then(slots => {
                __CACHE = [].concat(...slots);
                return __CACHE;
            });
    },
    filter(schedule, predicat, comparator) {
        return predicat(schedule, comparator);
    },
    sendSMS(body) {
        const client = require('twilio')(
            process.env.TWILIO_ACCOUNT_SID,
            process.env.TWILIO_AUTH_TOKEN
        );
        return new Promise((resolve, reject) => {
            client.messages.create({
                from: process.env.TWILIO_PHONE_NUMBER,
                to: process.env.CELL_PHONE_NUMBER,
                body
            }, (err, message) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(message);
                }
            });
        })
    }
};

// Predicates

const Predicates = {
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
    byTalkTrackPopular(schedule, maxElements) {
        schedule = schedule
            .filter(slot => slot.talk)
            .map(slot => slot.talk.track.trim().replace('&amp;', 'and'))
            .reduce((acc, topic) => {
                return acc.set(topic, (acc.get(topic) || 0) + 1);
            }, new Map());

        /**
         * schedule: Map<string, number> ={
         *      { 'Mind the Geek' => 2 },
         *      { 'Security' => 1 },
         *      { 'Architecture' => 4 },
         *      { ... } 
         * }
         */
        let acc = [];
        for (let pair of schedule) {
            acc.push(pair);
        }
        /**
         * acc: [][] = [
         *      [ 'Mind the Geek', 3 ],
         *      [ 'Security', 1 ],
         *      [ 'Architecture', 4 ],
         *      [ ... ]
         * ]
         */
        acc = acc.sort((a, b) => a[1] > b[1] ? -1 : 1);
        /**
         * sort acc by count (in reverse order)
         * acc: [][] = [
         *      [ 'Architecture', 4 ],
         *      [ 'Mind the Geek', 3 ],
         *      [ 'Security', 1 ],
         *      [ ... ]
         * ]
         */
        return acc.slice(0, maxElements);
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
const Intents = {
    listTopics(assistant) {
        Helpers.fetchSchedule()
            .then(schedule => Helpers.filter(schedule, Predicates.byTalkTrack))
            .then(topics => {
                assistant.ask(`The covered topics are: ${topics.join(', ')}. 
                            What do you want to learn about?'`);
            })
            .catch(error => {
                console.log(`listTopics: Error while fetching sessions: ${error.message}`);
                assistant.tell(`I wasn't able to reach the Devoxx REST API to list the available topics.`);
            });
    },
    listTopicsByPopularity(assistant) {
        let amount = assistant.getArgument('popular-topics-number');
        Helpers.fetchSchedule()
            .then(schedule => Helpers.filter(schedule, Predicates.byTalkTrackPopular, amount))
            .then(topics /*[[topic, count]]*/ => {
                const text = [];
                for (let topic of topics) {
                    text.push(`${topic[0]} with ${topic[1]} talks`);
                }
                assistant.ask(`The ${amount} most popular topics are: ${text.join(', ')}. 
                            What topic do you want to learn about?'`);
            })
            .catch(error => {
                console.log(`listTopicsByPopularity: Error while fetching sessions: ${error.message}`);
                assistant.tell(`I wasn't able to reach the Devoxx REST API to list the popular topics.`);
            });
    },
    speakersCount(assistant) {
        Helpers.fetchSchedule()
            .then(schedule => Helpers.filter(schedule, Predicates.bySpeaker))
            .then(speakers => {
                assistant.ask(`I found ${speakers.length} speakers.`);
            })
            .catch(error => {
                console.log(`speakersCount: Error while fetching sessions: ${error.message}`);
                assistant.tell(`I wasn't able to reach the Devoxx REST API to count the speakers.`);
            });
    },
    talksByTopics(assistant) {
        let topic = assistant.getArgument('topic-name');
        topic = topic.toLowerCase().replace('and ', '& ');

        if (topic === '') {
            assistant.ask(`Sorry, I didn't get what topic you were interested in. 
                       Is there another topic you'd like to hear about?`);
        } else {
            Helpers.fetchSchedule()
                .then(schedule => Helpers.filter(schedule, Predicates.byTopic, topic))
                .then(talks => {
                    const totalSessions = talks.length;
                    if (totalSessions === 0) {
                        assistant.ask(`Sorry, I couldn't find any session about ${topic}.
                                   Is there another topic you'd be interested in?`);
                    } else {
                        assistant.setContext('talk-context', 3, {
                            sessionIndex: 0,
                            talkIds: talks.map(talk => talk.id),
                            totalSessions
                        });
                        assistant.ask(`The next session about ${topic} is called ${talks[0].title}.
                                   Would you like to hear more about it or hear about the next session?`);
                    }
                })
                .catch(error => {
                    console.log(`talksByTopics: Error while fetching sessions: ${error.message}`);
                    assistant.tell(`I wasn't able to reach the Devoxx REST API 
                                to list the available sessions about ${topic}.`);
                });
        }
    },
    nextTalk(assistant) {
        const contexts = assistant.getContexts();
        const context = contexts.filter(value => value.name === 'talk-context')[0];
        const sessionIndex = context.parameters.sessionIndex + 1;
        const totalSessions = context.parameters.totalSessions;
        const talkIds = context.parameters.talkIds;
        const currentTalkId = talkIds[sessionIndex];

        assistant.setContext('talk-context', 3, { sessionIndex, talkIds, totalSessions });

        if (sessionIndex < totalSessions) {
            Helpers.fetchSchedule()
                .then(schedule => Helpers.filter(schedule, Predicates.byTalkId, currentTalkId))
                .then(slot => {
                    assistant.ask(`Sure, the next session is ${slot.talk.title}.
                       Would you like to hear more about it 
                       ${sessionIndex < totalSessions ? " or about the next session" : ""}?`)
                });
        } else {
            assistant.ask(`Sorry, there's no more session on that topic. 
                       Are you interested in other topics?`)
        }
    },
    moreOnATalk(assistant, callback) {
        const contexts = assistant.getContexts();
        const context = contexts.filter(value => value.name === 'talk-context')[0];
        const sessionIndex = context.parameters.sessionIndex;
        const talkIds = context.parameters.talkIds;
        const currentTalkId = talkIds[sessionIndex];

        Helpers.fetchSchedule()
            .then(schedule => Helpers.filter(schedule, Predicates.byTalkId, currentTalkId))
            .then(slot => {
                const amPm = +slot.fromTime.split(':')[0] > 12 ? 'PM' : 'AM';
                const time = `${slot.fromTime} ${amPm}`;
                const body = `Here is more information about ${slot.talk.title}.
                   The presentation ${Helpers.dayToPhrase(slot.day)}, at ${time}, in ${slot.roomName}. 
                   The abstract says: ${slot.talk.summary}.`;

                if (callback) {
                    callback(`${body} (${slot.talk.speakers[0].link.href})`);
                } else {
                    assistant.ask(`Sure, ${body} Would you like to hear about the next session?`);
                }
            })
            .catch(error => {
                console.log(`moreOnATalk: Error while fetching sessions: ${error.message}`);
                assistant.tell(`I wasn't able to reach the Devoxx REST API 
                                to list the available sessions about ${topic}.`);
            });
    },

    sendSMS(assistant) {
        Intents.moreOnATalk(assistant, body => {
            Helpers.sendSMS(body).then(_ => {
                    assistant.ask(`I just sent an SMS on your phone. Is there anything else I can help you with?`)
                })
                .catch(error => console.error(error.message));
        });
    }
};

exports.devoxx = (request, response) => {
    // Helpers.debug('request', request);

    const assistant = new ApiAiAssistant({ request, response });
    const actionMap = new Map();
    actionMap.set('speakers.count', Intents.speakersCount);
    actionMap.set('topics.list', Intents.listTopics);
    actionMap.set('topics.popular', Intents.listTopicsByPopularity);
    actionMap.set('talks.by.topic', Intents.talksByTopics);
    actionMap.set('talks.more', Intents.moreOnATalk);
    actionMap.set('talks.next', Intents.nextTalk);
    actionMap.set('send.sms', Intents.sendSMS);
    assistant.handleRequest(actionMap);

    // Helpers.debug('response', response);
};