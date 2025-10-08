For v2 release:
- expand all tests to check error paths in expects
- make sure all errors have an error code
- make sure basic schema errors are always returned right away in validation functions so there is no cannot read
  properties of undefined errors later on in the function
- add casting (e.g. string to number, 1 / 0 -> true / false, etc.)
- add ability for as much processing as possible to be done on the client side (e.g. splitting query into mutation 
  pieces with guids, but some things like filling in guids need to be done server side so you dont have too many
  round trips and for transactions)
- add support for explicitly choosing read / write in guids
- add support for non foreign key guids, as long as the foreign key is only a read guid and not a write guid (so its safe)
- make sure all identifiers are escaped in compilers