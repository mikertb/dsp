/* Set popovers */
$( document ).ready(function() {

    $("#accountbtn").popover({
        trigger: "click",
        placement: 'bottom',
        html : true,
        content: $('#account-menu').html()
    });
    $(document).on("mouseleave", '#accountContainer', function() {
       console.log('by');
        $("#accountbtn").popover('hide');
    });

    $(document).on("mouseover", ".thelp", function() { $(this).tooltip('show');});
});
