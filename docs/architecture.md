# QuickNotes Architecture

QuickNotes is moving from a browser-only app to an online service for **1 million users**. This document says what the service must do, how big it will get, and how the parts fit together.

## 1. Requirements

### Functional requirements (what it must do)
- A user can register and log in.
- A user can **create**, **read**, **update** and **delete** notes.
- Each note has a title (up to 100 characters) and an optional body.
- A user can add tags to notes and find notes by tag.
- A user sees only their own notes, and notes are available from any device.

### Non-functional requirements (how well it must do it)
- **Fast:** listing notes should answer in under 300 ms for 95% of requests.
- **Available:** the service should be up 99.9% of the time (about 9 hours of downtime a year at most), and no single machine failing should stop it.
- **Durable:** a saved note must never be lost. We keep backups and a second copy of the data.
- **Secure:** all traffic over HTTPS, passwords stored as hashes, every request checked for a valid user.
- **Scalable:** it must grow from 1 million users by adding machines, not by rewriting the system.
- **Consistent enough:** after saving a note, the user must see it straight away. A note appearing a few seconds late for *other* devices is acceptable.

## 2. Load estimate for 1 million users

### Assumptions

| Item | Value |
|------|-------|
| Registered users | 1,000,000 |
| Active each day | 20% |
| Reads per active user per day (list and open notes) | 20 |
| Writes per active user per day (create, edit, delete) | 3, of which 2 are new notes |
| Average stored size of one note (title, body, tags, metadata) | 2 KB |
| Peak traffic | 5 times the average |
| Seconds in a day | 86,400 |

**Daily active users** = 1,000,000 x 20% = **200,000**.

### Reads per second
- Reads per day = 200,000 x 20 = 4,000,000
- Average = 4,000,000 / 86,400 = **about 46 reads per second**
- Peak (5x) = **about 231 reads per second**

### Writes per second
- Writes per day = 200,000 x 3 = 600,000
- Average = 600,000 / 86,400 = **about 7 writes per second**
- Peak (5x) = **about 35 writes per second**

### Storage per year
- New notes per day = 200,000 x 2 = 400,000
- Data per day = 400,000 x 2 KB = 800 MB
- Per year = 800 MB x 365 = **about 292 GB**
- Allowing about double for indexes and tags, plan for **roughly 0.6 TB per year**.

**What this tells us.** Reads are about 6.7 times more common than writes, so QuickNotes is **read-heavy**, and the design leans on caching and a read replica. The numbers are modest: about 266 requests per second at peak. One app server could handle that, so we run two or more for **safety and availability**, not because of raw load. The same logic applies to every component below: they are here so that one failure does not take the service down, and so that growth is a matter of adding machines.

## 3. Architecture diagram

```
                      +-------------------------------+
                      |   Client (browser / mobile)   |
                      +---------------+---------------+
                                      |
                                      | "where is api.quicknotes.example?"
                                      v
                      +-------------------------------+
                      |              DNS              |
                      +---------------+---------------+
                                      | gives the address
                                      v
                +-----------------------------------------------+
                |                     CDN                       |
                |  caches static files (index.html, JS, CSS);   |
                |  API calls pass straight through              |
                +-----------------------+-----------------------+
                                        |
                                        v
                      +-------------------------------+
                      |         Load Balancer         |
                      +---------------+---------------+
                                      |
              +-----------------------+-----------------------+
              |                       |                       |
              v                       v                       v
      +---------------+       +---------------+       +---------------+
      | App Server 1  |       | App Server 2  |       | App Server N  |
      |  (stateless)  |       |  (stateless)  |       |  (stateless)  |
      +-------+-------+       +-------+-------+       +-------+-------+
              |                       |                       |
              +-----------+-----------+-----------+-----------+
                          |                       |
          +---------------+---------+             |
          |                         |             |
          v                         v             v
   +-------------+          +---------------+   +---------------+
   |    Cache    |          |  Primary DB   |   |     Queue     |
   | (hot notes) |          |   (writes)    |   |  (slow jobs)  |
   +-------------+          +-------+-------+   +-------+-------+
                                    |                   |
                                    | copies every      v
                                    | change    +---------------+
                                    v           |   Worker(s)   |
                            +---------------+   | search index, |
                            |  Read Replica |   | emails, clean |
                            |   (reads)     |   |   -up jobs    |
                            +---------------+   +---------------+

   GET  /notes :  App Server --> Cache --(miss)--> Read Replica
   POST /notes :  App Server --> Primary DB, clear Cache, add job to Queue --> Worker
```

## 4. What each component does (one sentence each)

- **Client:** The app the user touches, which turns taps and clicks into API requests and shows the results.
- **DNS:** Turns the name `api.quicknotes.example` into the address of our servers so clients can find us, and lets us move servers without changing the name.
- **CDN:** Keeps copies of static files (the page, scripts and styles) in servers close to each user, so the app loads quickly and our own servers are spared that work.
- **Load Balancer:** Shares incoming requests fairly across the app servers and stops sending traffic to any server that has failed.
- **App Servers:** Run the QuickNotes logic (check who you are, validate input, read and write data), and because they keep no memory between requests we can add or remove them freely.
- **Cache:** Holds frequently read results in fast memory so most reads never touch the database, which answers faster and protects the database from heavy traffic.
- **Primary Database:** The single place where all changes are written and the permanent, trusted copy of every user, note and tag is kept.
- **Read Replica:** A live copy of the primary that answers read requests, so the heavy read traffic does not slow down writing, and which can take over if the primary fails.
- **Queue:** Holds slow background jobs (such as "index this note for search") so the user gets a fast reply and no job is lost if a worker is busy.
- **Worker:** Takes jobs from the queue and does the slow work in the background, so app servers stay free to answer users.

## 5. Request flows

### GET /v1/notes (list my notes)

1. The client asks DNS for the address of `api.quicknotes.example`.
2. The request goes through the CDN (which does not cache private API answers) to the **load balancer**.
3. The load balancer picks a healthy **app server**.
4. The app server checks the access token. If it is missing or expired, it replies `401`.
5. The app server builds a cache key such as `notes:user:7:page:1` and asks the **cache**.
6. **Cache hit:** it returns the stored list immediately and the flow jumps to step 9.
7. **Cache miss:** the app server runs the query on the **read replica** (newest notes for that user, 10 per page).
8. The app server saves the result in the cache for 60 seconds, so the next request is a hit.
9. The app server replies `200 OK` with the JSON list, and the client displays it.

### POST /v1/notes (create a note)

1. The client sends the title, body and tags, and the request reaches an **app server** through the load balancer.
2. The app server checks the access token (`401` if invalid).
3. It validates the input: the title is required and at most 100 characters (`400` if not).
4. In one transaction on the **primary database**, it inserts the note and its tag links. If anything fails, nothing is saved.
5. It **deletes that user's list entries from the cache**, so the next list request fetches fresh data and the user sees their new note straight away.
6. It adds a job to the **queue**, for example "index note 42 for search".
7. It replies `201 Created` with the new note and a `Location` header. The user does not wait for step 8.
8. Later, a **worker** takes the job and does it. If the worker fails, the job stays in the queue and is retried.
9. Meanwhile the primary database copies the new note to the **read replica**, usually within a fraction of a second.

## 6. Trade-offs

1. **Cache: speed against fresh data.** Caching makes reads much faster and lets the database relax, but a cached list can be out of date for up to 60 seconds, for example after an edit from another device. We accept this because notes are not bank balances, and we clear the writer's own cache on every write so the person who made the change never sees old data.
2. **Read replica: more read capacity against replication lag.** The replica spreads read traffic and gives us a spare copy of the data, but it trails the primary by a moment. A user could save a note and not find it if the very next read went to a lagging replica. We reduce this by clearing the cache on writes and, for a short time after a write, reading that user's own notes from the primary.
3. **Queue and worker: quick replies against eventual results.** The user gets an instant `201` because slow work happens in the background, but results such as search indexing appear a few seconds later. It also adds two more parts to run and watch.
4. **One primary database: simple and correct against a write limit.** A single primary keeps data consistent and easy to reason about. At 35 writes per second at peak it is nowhere near its limit, but if writes grew a hundred times we would have to split the data across several databases (sharding), which is much more complex. We choose simplicity now and have a clear path to scale later.

## 7. Avoiding single points of failure

A single point of failure is one part whose breaking stops everything, like one bridge into a town. For each component we make sure there is a second way through:

| Component | How a single failure is avoided |
|-----------|---------------------------------|
| DNS | Use a DNS provider that runs many name servers in different places |
| CDN | A CDN is spread across hundreds of locations by design |
| Load Balancer | Run two load balancers in different zones (or a managed one that does this). If one fails, the other takes over |
| App Servers | Run at least two, in different data-centre zones. They are stateless, so any one can serve any request, and the load balancer drops a failed one |
| Cache | Run the cache with a standby copy. If the cache is lost, the app servers simply read from the database more slowly, so the service stays up |
| Primary Database | Keep a replica that can be promoted to primary automatically if the primary fails, plus regular backups and a write-ahead log for point-in-time recovery |
| Read Replica | Run more than one. Reads go to whichever is healthy, and the primary can serve reads in an emergency |
| Queue | Use a replicated queue service so jobs survive a machine failure |
| Worker | Run several workers. Failed jobs return to the queue and are retried, and jobs that keep failing go to a "dead-letter" queue for inspection |

Spreading everything across **at least two availability zones** (separate buildings) also means that even a whole data-centre problem leaves the service running.
