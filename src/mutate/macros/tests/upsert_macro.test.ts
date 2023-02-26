/*

Use cases:

upsert a post -> create the post
upsert a post -> update the post

upsert two different posts with the same user nested inside
    -> create the posts, create the user once
    -> throw an error if any non-identifying field of the users are different,
       since if the identifying field is the same, but anything else is different, it
       is ambiguous. Actually this should be for any update, or update + create combo.
    -> Make sure the unique check middleware doesnt reject it. Maybe that middleware should
       actually be the one to check this after upsert middleware, and should allow duplicate updates only 
       if all other fields are identical or not provided

Support $identifying_fields (e.g. $identifying_fields: ['title']) syntax. get identifying fields function
should
    1. respect user provided identifying fields
    2. cache to a $identifying fields if possible, so we dont recalculate it all the time. Maybe as a pre middleware
       if we dont need anything from the database to calculate identifying fields for all updates

Also identfying fields needs validation

Support $operation: 'upsert'. Upserts have all the strictness of both updates and creates (e.g. they cant have
    ambiguous identifying keys like updates, but also must have required fields provided like creates. This is
    because an upsert can be either a create or an update)


Algorithm idea:

0. update anything that references $operation which runs pre-upsert middleware (so basically propagate $guid.
    think through all the cases, i.e. if each of the parent / child upserts is a create or an update)
1. Fetch upserted rows from the database, based on given $identifying_key
2. Match them to the upsert rows. If there is a match, either in the database rows, or in the previously checked 
    upserts, then the upsert converts to an update. Otherwise, it turns into a create.
3. Keep track of each entity + identifying key that is created in an object or set for quick lookup.

*/
