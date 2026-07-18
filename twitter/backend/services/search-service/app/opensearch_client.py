from opensearchpy import OpenSearch, RequestError

from app.config import settings

client = OpenSearch(hosts=[settings.opensearch_url], use_ssl=False)

TWEETS_INDEX = "tweets"
USERS_INDEX = "users"

TWEETS_MAPPING = {
    "mappings": {
        "properties": {
            "tweet_id": {"type": "integer"},
            "user_id": {"type": "integer"},
            "content": {"type": "text", "analyzer": "english"},
            "created_at": {"type": "date"},
        }
    }
}

# username gets a second, edge-ngram-analyzed field so a partial prefix like
# "mar" matches "maria_lopez" - the same reason the old ILIKE version did a
# substring match: short identifiers want prefix search, not the word-level
# relevance scoring that makes sense for tweet content.
USERS_MAPPING = {
    "settings": {
        "analysis": {
            "tokenizer": {
                "username_edge_ngram": {
                    "type": "edge_ngram",
                    "min_gram": 1,
                    "max_gram": 20,
                    "token_chars": ["letter", "digit"],
                }
            },
            "analyzer": {
                "username_autocomplete": {
                    "type": "custom",
                    "tokenizer": "username_edge_ngram",
                    "filter": ["lowercase"],
                }
            },
        }
    },
    "mappings": {
        "properties": {
            "user_id": {"type": "integer"},
            "username": {
                "type": "text",
                "fields": {"autocomplete": {"type": "text", "analyzer": "username_autocomplete"}},
            },
            "display_name": {"type": "text"},
        }
    },
}


def ensure_indices() -> None:
    # search-service and search-indexer-worker both call this at their own
    # startup, and both come up as soon as OpenSearch is healthy - the
    # exists() check alone leaves a window where both processes see "not
    # created yet" and both call create(), so the loser needs its
    # already-exists error caught rather than crashing the container.
    for index, mapping in [(TWEETS_INDEX, TWEETS_MAPPING), (USERS_INDEX, USERS_MAPPING)]:
        if client.indices.exists(index=index):
            continue
        try:
            client.indices.create(index=index, body=mapping)
        except RequestError as exc:
            if exc.error != "resource_already_exists_exception":
                raise
