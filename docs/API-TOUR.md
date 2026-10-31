# Whatnot Seller API: a plain-English tour

Whatnot API Demo, by Mood Swings Design.

The Seller API has 34 functions in nine groups. This tour goes through all of
them in the same order as the explorer app. Each entry says what it does for a
seller, what you give it, what comes back, and its safety class:

- **read** only looks. Always safe.
- **write** creates or changes your own product data. Only run on the demo product.
- **destructive** cancels, spends money, deletes or disconnects.

One note before the tour. Whatnot's reference lists a 35th operation, `GET /`, a
health check. It also needs a token, and it is not in the connector, so it is
not one of the 34 functions here.

Lists give you up to 50 results at a time (you ask with `limit`) plus a
`next_cursor` to fetch the next page. `reverse` flips the order.

## Users

**get_the_current_user**
Tells you who the connection belongs to: your seller name, user id, country and
currency. Give it nothing. You get back your profile. Handy as the very first
call, to prove the token works. Safety class: read.

**disconnect_the_current_application**
Cuts the link between Whatnot and the app using it, so the token stops working.
Give it nothing. The demo never runs this, because it would break your own
connector and you would have to reconnect everything. The recorded answer says
"not run" and explains why. Safety class: destructive.

## Shows

**list_shows**
Lists your shows, filtered by status: scheduled, live, stopped, ended or
cancelled. Without a status it shows scheduled ones. Give it a status, a page
size and optionally a cursor. You get a page of shows with ids, titles and
start times. Use it to find the show you want to sell in. Safety class: read.

**get_a_show**
Fetches one show by its id. Give it the show id. You get the title, status,
start time and other details for that show. Safety class: read.

## Analytics

**get_show_analytics**
Gives the numbers for one show, such as viewers and sales, so you can judge how
a stream went once it is over. Give it the show id. You get the figures back as
one record. A brand new or empty show will have mostly zeros. Safety class: read.

**generate_a_report**
Asks Whatnot to build a report in the background. There are three kinds: a
financial report (what you earned over a date range), an analytics overview (a
date range of activity) and a livestreams report (all shows matching a filter,
or a list of show ids you name). Give it the report type and its dates or
filters. You get back a report run with an id and a status such as pending.
It asks Whatnot to do work but changes none of your products or orders.
Safety class: write.

**get_a_report**
Checks on one report run and, when it is finished, tells you how to get the
result. Give it the report id from the previous call. You get the status
(pending, in progress, completed, failed or cancelled) and details. Safety
class: read.

**list_reports**
Lists the reports you have asked for, newest first, optionally only those with
one status. Give it an optional status and paging. You get a page of report runs.
Use it to find a report you started earlier. Safety class: read.

## Products

**list_products**
Lists the products in your inventory. Give it a page size and optionally a
cursor. You get a page of products with ids and titles. Use it to see what you
have before a show. Safety class: read.

**create_a_product**
Adds a new product to your inventory. You give it a title, a category and a
shipping size (a dimension profile, either an existing one by id or a weight and
box size). Optionally add a description, photos, options such as Color, and
attributes. You get back the new product with its id and its first variant. The
demo uses it once, to make "API DEMO TEST ITEM". Safety class: write.

**get_a_product**
Fetches one product by id. Give it the product id. You get everything about it:
title, description, category, shipping size, options and photos. Safety class: read.

**update_a_product**
Changes details of an existing product, such as its title, description,
category, shipping size or photos. Give it the product id and only the fields you
want to change. You get back the updated product. Safety class: write.

**delete_a_product**
Removes a product from your inventory. Give it the product id. Nothing useful
comes back beyond a success status. The demo runs this exactly once, on the demo
product at the end of the run, because a real product that is deleted may be
gone for good along with its show history. It is never run on your real
products. Safety class: destructive.

**list_product_variants**
Lists the variants of a product. A variant is one specific version you can sell,
for example the Red one. A simple product has a single variant. Give it the
product id. You get each variant with its id, SKU and price. Safety class: read.

**get_a_product_variant**
Fetches one variant. Give it the product id and the variant id. You get its SKU,
prices, stock and photo. Safety class: read.

**update_product_variants**
Changes up to 10 variants of one product in one go: SKU, external id, country of
origin, photo, the buy-it-now price or the auction starting price. Give it the
product id and the list of changes. You can choose whether one bad entry rejects
the whole batch or only that entry is skipped (`allow_partial_updates`). You get
back the updated variants and any errors. Safety class: write.

**list_a_product_s_shows**
Lists the shows a product is lined up for. Give it the product id. You get the
shows it has been added to. Use it to answer "where is this item scheduled?".
Safety class: read.

## Inventory

**set_inventory**
Sets the stock count of up to 10 variants to an exact number. Give it, for each
variant, the variant id, the new quantity and an idempotency key (a made-up
unique label so that sending the same request twice cannot double-apply). You
get back the resulting stock levels. Safety class: write.

**adjust_inventory**
Changes stock by a plus or minus amount instead of an exact number, for example
minus 1 after you sell something offline. Give it the variant id, the delta and
an idempotency key for each of up to 10 items. You get back the new stock
levels. Safety class: write.

## Merchandising

**get_a_product_s_merchandising**
Shows how a product is set up to sell: as a buy-it-now or an auction, whether it
is reserved for live shows only, and which shows it is in. Give it the product
id. You get those settings back. Safety class: read.

**update_a_product_s_merchandising**
Changes how a product sells and which shows it is in. You can switch between
buy-it-now and auction, turn "reserve for live" on or off, and add shows,
remove shows or replace the whole list (strategy ADD, REMOVE or REPLACE, up to
25 show ids). Give it the product id and only the parts to change. You get back
the new setup. The demo uses it to put the demo product into the private test
show, then to take it out again. Safety class: write.

## Shipping

**list_dimension_profiles**
Lists the saved package sizes and weights. Some belong to Whatnot (for example
"0-1 oz") and some are yours (for example a giveaway envelope). Give it a page
size and optionally a cursor. You get a page of profiles with weight and
dimensions. Use it to pick a shipping size when creating a product. Safety class: read.

**get_a_dimension_profile**
Fetches one package size by id. Give it the dimension profile id. You get its
name, who owns it, its weight and its dimensions. Safety class: read.

## Orders

**list_orders**
Lists your orders, newest first. Give it a page size and optionally a cursor.
You get a page of orders with ids, totals and statuses. This is how you work out
what needs packing after a show. In the saved answers, buyer names and
addresses are blanked. Safety class: read.

**get_an_order**
Fetches one order. Give it the order id. You get the total, status, timestamps
and the buyer record (blanked in the saved copy). Safety class: read.

**list_order_items**
Lists the individual items inside one order. Give it the order id. You get each
item with its id, product and price. Use it to see exactly what a buyer bought.
Safety class: read.

**get_an_order_item**
Fetches one item from an order. Give it the order id and the item id. You get
its product, price and status. Safety class: read.

**cancel_an_order**
Cancels an order, with a reason: item_damaged, item_sold, item_missing,
break_did_not_fill or other. Give it the order id and the reason. This affects a
real buyer who has already paid, so the demo never runs it on a real order. It is
shown once with the impossible id "1", so you can see Whatnot's real "not found"
error without anything being cancelled. Safety class: destructive.

**add_a_tracking_code_to_order_items**
Attaches a carrier and tracking number to up to 100 order items, which tells the
buyer their order has shipped. Give it the item ids, the tracking code and the
carrier (for example usps). A wrong code goes straight to a real buyer and is
awkward to undo, so the demo never runs it on real orders. It is shown once with
the impossible id "1" to capture the real error (Whatnot answered 422, an
invalid parameter, because the item id is not a real one). Safety class: destructive.

## Shipments

**list_shipments**
Lists your shipments, newest first. Give it a page size and optionally a cursor.
You get a page of shipments with ids and statuses. Safety class: read.

**get_a_shipment**
Fetches one shipment. Give it the shipment id. You get the status, carrier and
tracking details. Buyer details are blanked in the saved copy. Safety class: read.

**list_shipment_items**
Lists the items packed in one shipment. Give it the shipment id. You get each
item with its id. Use it to build a packing list. Safety class: read.

**get_a_shipment_item**
Fetches one item of a shipment. Give it the shipment id and the item id. You get
that item's details. Safety class: read.

**request_a_shipping_label**
Buys a shipping label for a shipment through Whatnot. Give it the shipment id.
You get back the label details. This costs real money and cannot be taken back,
so the demo never runs it on a real shipment. It is shown once with the
impossible id "1" to capture the real error. Safety class: destructive.

## How the recorded run was made

The run was made once, through the Whatnot connector in Claude, against your
private test show. One call per second, to stay well inside the limits. Whatnot's guide
says 10 requests a second per seller per app, and the connector reported a
lower policy of 2 a second. See `LIMITS-AND-PAGING.md`.

1. **Reads.** The harmless functions first: current user, shows, analytics,
   reports, products, shipping sizes, then orders and shipments. Order and
   shipment answers had buyer names and addresses blanked before saving.
2. **One demo product.** A product titled "API DEMO TEST ITEM" was created, read,
   updated, then its variants were listed, read and updated. Its inventory was
   set and adjusted, and it was merchandised into the private test show. The
   first attempt to add it to the show was refused because the product had no
   image, so one image was added and the second attempt went through. A later
   live run from the page found the other rule: every variant must have a price
   before the product can be merchandised. So a product needs both an image
   and a price before it can go into a show. Then a
   livestream report was generated and checked. Note that the variant,
   set-inventory and adjust-inventory calls answer 207 Multi-Status even when
   every item succeeds; the per-item results inside the body tell the story.
3. **Three error demonstrations.** cancel_an_order,
   add_a_tracking_code_to_order_items and request_a_shipping_label were each sent
   the impossible id "1", so the real error answers are saved and nothing real
   could change.
4. **Cleanup.** The demo product was removed from the show and then deleted.
   A read afterwards confirmed it was gone. The finished report's download link
   was blanked in the saved answer because it was a live signed link.
5. **Never called.** disconnect_the_current_application was not run at any point.

The ids used and the cleanup result are in `fixtures/_run.json`.
