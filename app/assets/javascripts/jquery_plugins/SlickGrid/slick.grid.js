/**
 * @license
 * (c) 2009-2016 Michael Leibman
 * michael{dot}leibman{at}gmail{dot}com
 * http://github.com/mleibman/slickgrid
 *
 * Distributed under MIT license.
 * All rights reserved.
 *
 * SlickGrid v2.3
 *
 * NOTES:
 *     Cell/row DOM manipulations are done directly bypassing jQuery's DOM manipulation methods.
 *     This increases the speed dramatically, but can only be done safely because there are no event handlers
 *     or data associated with any cell/row DOM nodes.  Cell editors must make sure they implement .destroy()
 *     and do proper cleanup.
 */

 /*
  * Ekohe fork:
  *
  *   1.  Material Design UI
  *   2.  Color theme support
  *   3.  Don't show invisible columns
  *   4.  Show selection info on grid header
  *   5.  Support to specify editor type
  *   6.  Row detail view support
  *   7.  Use column's option to decide if make cell editable when ENTER
  *   8.  Use current cell instead of the whole row for submit in onCellChange trigger
  *   9.  JSON viewer support
  *   10. column_editable option support
  *   11. Add data-id attribute to each row for manipulating rows easily
  *   98. New events: onRendered, onCanvasResized
  *   99. New APIs
  */

// make sure required JavaScript modules are loaded
if (typeof jQuery === "undefined") {
  throw new Error("SlickGrid requires jquery module to be loaded");
}
if (!jQuery.fn.drag) {
  throw new Error("SlickGrid requires jquery.event.drag module to be loaded");
}
if (typeof Slick === "undefined") {
  throw new Error("slick.core.js not loaded");
}


(function ($) {
  // Slick.Grid
  $.extend(true, window, {
    Slick: {
      Grid: SlickGrid
    }
  });

  // shared across all grids on the page
  var scrollbarDimensions;
  var maxSupportedCssHeight;  // browser's breaking point

  //////////////////////////////////////////////////////////////////////////////////////////////
  // SlickGrid class implementation (available as Slick.Grid)

  /**
   * Creates a new instance of the grid.
   * @class SlickGrid
   * @constructor
   * @param {Node}              container   Container node to create the grid in.
   * @param {Array,Object}      data        An array of objects for databinding.
   * @param {Array}             columns     An array of column definitions.
   * @param {Object}            options     Grid options.
   **/
  function SlickGrid(container, data, columns, options) {
    // settings
    var defaults = {
      alwaysShowVerticalScroll: false,
      explicitInitialization: false,
      rowHeight: 25,
      defaultColumnWidth: 80,
      enableAddRow: false,
      leaveSpaceForNewRows: false,
      editable: false,
      autoEdit: true,
      suppressActiveCellChangeOnEdit: false,
      enableCellNavigation: true,
      enableColumnReorder: true,
      asyncEditorLoading: false,
      asyncEditorLoadDelay: 100,
      forceFitColumns: false,
      enableAsyncPostRender: false,
      asyncPostRenderDelay: 50,
      enableAsyncPostRenderCleanup: false,
      asyncPostRenderCleanupDelay: 40,
      autoHeight: false,
      editorLock: Slick.GlobalEditorLock,
      showHeaderRow: false,
      headerRowHeight: 25,
      createFooterRow: false,
      showFooterRow: false,
      footerRowHeight: 25,
      createPreHeaderPanel: false,
      showPreHeaderPanel: false,
      preHeaderPanelHeight: 25,
      showTopPanel: false,
      topPanelHeight: 25,
      formatterFactory: null,
      editorFactory: null,
      cellFlashingCssClass: "flashing",
      selectedCellCssClass: "selected",
      multiSelect: true,
      enableTextSelectionOnCells: false,
      dataItemColumnValueExtractor: null,
      fullWidthRows: false,
      multiColumnSort: false,
      numberedMultiColumnSort: false,
      tristateMultiColumnSort: false,
      sortColNumberInSeparateSpan: false,
      defaultFormatter: defaultFormatter,
      forceSyncScrolling: false,
      addNewRowCssClass: "new-row",
      preserveCopiedSelectionOnPaste: false,
      showCellSelection: true,
      viewportClass: null,
      minRowBuffer: 3,
      emulatePagingWhenScrolling: true, // when scrolling off bottom of viewport, place new row at top of viewport
      editorCellNavOnLRKeys: false
    };

    var columnDefaults = {
      name: "",
      resizable: true,
      sortable: false,
      minWidth: 30,
      rerenderOnResize: false,
      headerCssClass: null,
      defaultSortAsc: true,
      focusable: true,
      selectable: true
    };

    // scroller
    var th;   // virtual height
    var h;    // real scrollable height
    var ph;   // page height
    var n;    // number of pages
    var cj;   // "jumpiness" coefficient

    var page = 0;       // current page
    var offset = 0;     // current page offset
    var vScrollDir = 1;

    // private
    var initialized = false;
    var $container;
    var uid = "slickgrid_" + randomNumber();
    var self = this;
    var $focusSink, $focusSink2;
    var $headerScroller;
    var $headers;
    var $headerRow, $headerRowScroller, $headerRowSpacer;
    var $footerRow, $footerRowScroller, $footerRowSpacer;
    var $preHeaderPanel, $preHeaderPanelScroller, $preHeaderPanelSpacer;
    var $topPanelScroller;
    var $topPanel;
    var $viewport;
    var $canvas;
    var $style;
    var $boundAncestors;
    var stylesheet, columnCssRulesL, columnCssRulesR;
    var viewportH, viewportW;
    var canvasWidth;
    var viewportHasHScroll, viewportHasVScroll;
    var headerColumnWidthDiff = 0, headerColumnHeightDiff = 0, // border+padding
        cellWidthDiff = 0, cellHeightDiff = 0, jQueryNewWidthBehaviour = false;
    var absoluteColumnMinWidth;

    var tabbingDirection = 1;
    var activePosX;
    var activeRow, activeCell;
    var activeCellNode = null;
    var currentEditor = null;
    var serializedEditorValue;
    var editController;

    var rowsCache = {};
    var renderedRows = 0;
    var numVisibleRows;
    var prevScrollTop = 0;
    var scrollTop = 0;
    var lastRenderedScrollTop = 0;
    var lastRenderedScrollLeft = 0;
    var prevScrollLeft = 0;
    var scrollLeft = 0;

    var selectionModel;
    var selectedRows = [];

    var plugins = [];
    var cellCssClasses = {};

    var columnsById = {};
    var sortColumns = [];
    var columnPosLeft = [];
    var columnPosRight = [];

    var pagingActive = false;
    var pagingIsLastPage = false;

    // async call handles
    var h_editorLoader = null;
    var h_render = null;
    var h_postrender = null;
    var h_postrenderCleanup = null;
    var postProcessedRows = {};
    var postProcessToRow = null;
    var postProcessFromRow = null;
    var postProcessedCleanupQueue = [];
    var postProcessgroupId = 0;

    // perf counters
    var counter_rows_rendered = 0;
    var counter_rows_removed = 0;

    // These two variables work around a bug with inertial scrolling in Webkit/Blink on Mac.
    // See http://crbug.com/312427.
    var rowNodeFromLastMouseWheelEvent;  // this node must not be deleted while inertial scrolling
    var zombieRowNodeFromLastMouseWheelEvent;  // node that was hidden instead of getting deleted
    var zombieRowCacheFromLastMouseWheelEvent;  // row cache for above node
    var zombieRowPostProcessedFromLastMouseWheelEvent;  // post processing references for above node

    // store css attributes if display:none is active in container or parent
    var cssShow = { position: 'absolute', visibility: 'hidden', display: 'block' };
    var $hiddenParents;
    var oldProps = [];
    var columnResizeDragging = false;
    var sortable = null;

    //////////////////////////////////////////////////////////////////////////////////////////////
    // Initialization
    //
    // Ekohe Edit:
    // 1. Add color setting to grid container

    function init() {
      if (container instanceof jQuery) {
        $container = container;
      } else {
        $container = $(container);
      }
      if ($container.length < 1) {
        throw new Error("SlickGrid requires a valid container, " + container + " does not exist in the DOM.");
      }

      // Ekohe Add: Add color related class to grid container
      if (options['colorTheme']) {
        $container.parent('.grid_container').addClass('grid-color-' + options['colorTheme']);
      }
      if (options['selectionColor']) {
        $container.parent('.grid_container').addClass('grid-selection-color-' + options['selectionColor']);
      }
      if (options['bgColor']) {
        $container.parent('.grid_container').addClass('grid-bg-color-' + options['bgColor']);
      }

      cacheCssForHiddenInit();

      // calculate these only once and share between grid instances
      maxSupportedCssHeight = maxSupportedCssHeight || getMaxSupportedCssHeight();

      options = $.extend({}, defaults, options);
      validateAndEnforceOptions();
      columnDefaults.width = options.defaultColumnWidth;

      columnsById = {};
      for (var i = 0; i < columns.length; i++) {
        var m = columns[i] = $.extend({}, columnDefaults, columns[i]);
        columnsById[m.id] = i;
        if (m.minWidth && m.width < m.minWidth) {
          m.width = m.minWidth;
        }
        if (m.maxWidth && m.width > m.maxWidth) {
          m.width = m.maxWidth;
        }
      }

      // validate loaded JavaScript modules against requested options
      if (options.enableColumnReorder && !$.fn.sortable) {
        throw new Error("SlickGrid's 'enableColumnReorder = true' option requires jquery-ui.sortable module to be loaded");
      }

      editController = {
        "commitCurrentEdit": commitCurrentEdit,
        "cancelCurrentEdit": cancelCurrentEdit
      };

      $container
          .empty()
          .css("overflow", "hidden")
          .css("outline", 0)
          .addClass(uid)
          .addClass("ui-widget");

      // set up a positioning container if needed
      if (!/relative|absolute|fixed/.test($container.css("position"))) {
        $container.css('position', 'relative');
      }

      $focusSink = $("<div tabIndex='0' hideFocus style='position:fixed;width:0;height:0;top:0;left:0;outline:0;'></div>").appendTo($container);

      if (options.createPreHeaderPanel) {
        $preHeaderPanelScroller = $("<div class='slick-preheader-panel ui-state-default' style='overflow:hidden;position:relative;' />").appendTo($container);
        $preHeaderPanel = $("<div />").appendTo($preHeaderPanelScroller);
        $preHeaderPanelSpacer = $("<div style='display:block;height:1px;position:absolute;top:0;left:0;'></div>")
            .appendTo($preHeaderPanelScroller);

        if (!options.showPreHeaderPanel) {
          $preHeaderPanelScroller.hide();
        }
      }

      $headerScroller = $("<div class='slick-header ui-state-default' />").appendTo($container);
      $headers = $("<div class='slick-header-columns' style='left:-1000px' />").appendTo($headerScroller);

      $headerRowScroller = $("<div class='slick-headerrow ui-state-default' />").appendTo($container);
      $headerRow = $("<div class='slick-headerrow-columns' />").appendTo($headerRowScroller);
      $headerRowSpacer = $("<div style='display:block;height:1px;position:absolute;top:0;left:0;'></div>")
          .appendTo($headerRowScroller);

      $topPanelScroller = $("<div class='slick-top-panel-scroller ui-state-default' />").appendTo($container);
      $topPanel = $("<div class='slick-top-panel' style='width:10000px' />").appendTo($topPanelScroller);

      if (!options.showTopPanel) {
        $topPanelScroller.hide();
      }

      if (!options.showHeaderRow) {
        $headerRowScroller.hide();
      }

      $viewport = $("<div class='slick-viewport' style='width:100%;overflow:auto;outline:0;position:relative;;'>").appendTo($container);
      $viewport.css("overflow-y", options.alwaysShowVerticalScroll ? "scroll" : (options.autoHeight ? "hidden" : "auto"));
      $viewport.css("overflow-x", options.forceFitColumns ? "hidden" : "auto");
      if (options.viewportClass) $viewport.toggleClass(options.viewportClass, true);

      $canvas = $("<div class='grid-canvas' />").appendTo($viewport);

      scrollbarDimensions = scrollbarDimensions || measureScrollbar();

      if ($preHeaderPanelSpacer) $preHeaderPanelSpacer.css("width", getCanvasWidth() + scrollbarDimensions.width + "px");
      $headers.width(getHeadersWidth());
      $headerRowSpacer.css("width", getCanvasWidth() + scrollbarDimensions.width + "px");



      if (options.createFooterRow) {
        $footerRowScroller = $("<div class='slick-footerrow ui-state-default' />").appendTo($container);
        $footerRow = $("<div class='slick-footerrow-columns' />").appendTo($footerRowScroller);
        $footerRowSpacer = $("<div style='display:block;height:1px;position:absolute;top:0;left:0;'></div>")
            .css("width", getCanvasWidth() + scrollbarDimensions.width + "px")
            .appendTo($footerRowScroller);

        if (!options.showFooterRow) {
          $footerRowScroller.hide();
        }
      }

      $focusSink2 = $focusSink.clone().appendTo($container);

      if (!options.explicitInitialization) {
        finishInitialization();
      }
    }

    //////////////////////////////////////////////////////////////////////////////////////////////
    // Ekohe Edit
    //   1. Remove invisible columns

    function finishInitialization() {

      // Ekohe Add: Remove invisible columns
      setColumnsById({});
      removeInvisibleColumns();

      if (!initialized) {
        initialized = true;

        viewportW = parseFloat($.css($container[0], "width", true));

        // header columns and cells may have different padding/border skewing width calculations (box-sizing, hello?)
        // calculate the diff so we can set consistent sizes
        measureCellPaddingAndBorder();

        // for usability reasons, all text selection in SlickGrid is disabled
        // with the exception of input and textarea elements (selection must
        // be enabled there so that editors work as expected); note that
        // selection in grid cells (grid body) is already unavailable in
        // all browsers except IE
        disableSelection($headers); // disable all text selection in header (including input and textarea)

        if (!options.enableTextSelectionOnCells) {
          // disable text selection in grid cells except in input and textarea elements
          // (this is IE-specific, because selectstart event will only fire in IE)
          $viewport.on("selectstart.ui", function (event) {
            return $(event.target).is("input,textarea");
          });
        }

        updateColumnCaches();
        createColumnHeaders();
        setupColumnSort();
        createCssRules();
        resizeCanvas();
        bindAncestorScrollEvents();
        bindWindowResize();
        restoreButtons();

        $container
            .on("resize.slickgrid", resizeCanvas);
        $viewport
            //.on("click", handleClick)
            .on("scroll", handleScroll);
        $headerScroller
            //.on("scroll", handleHeaderScroll)
            .on("contextmenu", handleHeaderContextMenu)
            .on("click", handleHeaderClick)
            .on("mouseenter", ".slick-header-column", handleHeaderMouseEnter)
            .on("mouseleave", ".slick-header-column", handleHeaderMouseLeave)

        $headerRowScroller
            .on("scroll", handleHeaderRowScroll);

        if (options.createFooterRow) {
          $footerRowScroller
              .on("scroll", handleFooterRowScroll);
        }

        if (options.createPreHeaderPanel) {
          $preHeaderPanelScroller
              .on("scroll", handlePreHeaderPanelScroll);
        }

        $focusSink.add($focusSink2)
            .on("keydown", handleKeyDown);
        $canvas
            .on("keydown", handleKeyDown)
            .on("click", handleClick)
            .on("dblclick", handleDblClick)
            .on("contextmenu", handleContextMenu)
            .on("draginit", handleDragInit)
            .on("dragstart", {distance: 3}, handleDragStart)
            .on("drag", handleDrag)
            .on("dragend", handleDragEnd)
            .on("mouseenter", ".slick-cell", handleMouseEnter)
            .on("mouseleave", ".slick-cell", handleMouseLeave);

        // Work around http://crbug.com/312427.
        if (navigator.userAgent.toLowerCase().match(/webkit/) &&
            navigator.userAgent.toLowerCase().match(/macintosh/)) {
          $canvas.on("mousewheel", handleMouseWheel);
        }
        restoreCssFromHiddenInit();
      }
    }

    function restoreButtons() {
      var $gridContainer = $container.parent();
      var selectButtons = $gridContainer.find('.toolbar-select .toolbar_item');
      // cal the global buttons width. Absolutely, when merged mode, there is no .toolbar-global class,
      // the globalBottunsWidth will be 0. It makes sense.
      var globalBottunsWidth = [...$gridContainer.find('.toolbar-global .toolbar_item')].reduce(
          (accumulator, currentValue) => accumulator + $(currentValue).width(),
          0
        );
      var toolbarWrapperWidth = Math.max($gridContainer.find('.toolbar-wrapper').width(), globalBottunsWidth);
      var availableWidth = toolbarWrapperWidth - globalBottunsWidth;
      var selectButtons = $gridContainer.find('.toolbar-select .toolbar_item');
      var visiableSelectButtons = $gridContainer.find('.toolbar-select .toolbar_item:visible');
      //initialize tooltip
      $(document).ready(function(){
        $('.tooltipped').tooltip();
      });
      // 5 is a buffer width to void being too crowd.
      var singleSelectButtonWidth = (visiableSelectButtons.width() || 38) + 5;
      var capableSelectButtonNumber = Math.max(Math.floor(availableWidth / singleSelectButtonWidth), 1);
      var buttonExceptMoreButtonNumbers = capableSelectButtonNumber - 1;
      var showButtons = selectButtons.slice(0, buttonExceptMoreButtonNumbers);
      var moreButtons = selectButtons.slice(buttonExceptMoreButtonNumbers, selectButtons.length - 1);

      // when more buttons is present, the 'more button' should be shown
      // at the same time, some buttons should hide from the boolbar
      if (moreButtons.length > 0) {
        // show the 'more button'
        $gridContainer.find('.more_vert').show();
        for(let element of showButtons) {
          // when element in the toolbar shows, the element under the more
          // button should be hiden
          $(element).show()
          $container
            .parent()
            .find('ul.dropdown-content li')
            .find("a[data-id='" + $(element).children('a').attr('id') + "']")
            .parent()
            .hide()
        }
        for(let element of moreButtons) {
          // when the element in the toolbar hides, the element under the more
          // button should be shown, and add the waves-effect class for beauty(only when split mode)
          $(element).hide()
          var moreVertItem = $container
            .parent()
            .find('ul.dropdown-content li')
            .find("a[data-id='" + $(element).children('a').attr('id') + "']")
          var buttonMode = $gridContainer
            .find('.toolbar-select')
            .data('mode');
          var isSplitMode = buttonMode === 'split';
          if (isSplitMode) {
            moreVertItem.addClass('waves-effect')
          }
          moreVertItem.parent()
          .show();
        }
      } else {
        for(let element of showButtons) {
          $(element).show()
        }
        // when there is no buttons being odd, the 'more button' should be hiden.
        $gridContainer.find('.more_vert').hide();
      }

    }

    function cacheCssForHiddenInit() {
      // handle display:none on container or container parents
      $hiddenParents = $container.parents().addBack().not(':visible');
      $hiddenParents.each(function() {
        var old = {};
        for ( var name in cssShow ) {
          old[ name ] = this.style[ name ];
          this.style[ name ] = cssShow[ name ];
        }
        oldProps.push(old);
      });
    }

    function restoreCssFromHiddenInit() {
      // finish handle display:none on container or container parents
      // - put values back the way they were
      $hiddenParents.each(function(i) {
        var old = oldProps[i];
        for ( var name in cssShow ) {
          this.style[ name ] = old[ name ];
        }
      });
    }

    function registerPlugin(plugin) {
      plugins.unshift(plugin);
      plugin.init(self);
    }

    function unregisterPlugin(plugin) {
      for (var i = plugins.length; i >= 0; i--) {
        if (plugins[i] === plugin) {
          if (plugins[i].destroy) {
            plugins[i].destroy();
          }
          plugins.splice(i, 1);
          break;
        }
      }
    }

    function setSelectionModel(model) {
      if (selectionModel) {
        selectionModel.onSelectedRangesChanged.unsubscribe(handleSelectedRangesChanged);
        if (selectionModel.destroy) {
          selectionModel.destroy();
        }
      }

      selectionModel = model;
      if (selectionModel) {
        selectionModel.init(self);
        selectionModel.onSelectedRangesChanged.subscribe(handleSelectedRangesChanged);
      }
    }

    function getSelectionModel() {
      return selectionModel;
    }

    function getCanvasNode() {
      return $canvas[0];
    }

    function measureScrollbar() {
      var $outerdiv = $('<div class="' + $viewport.className + '" style="position:absolute; top:-10000px; left:-10000px; overflow:auto; width:100px; height:100px;"></div>').appendTo($viewport);
      var $innerdiv = $('<div style="width:200px; height:200px; overflow:auto;"></div>').appendTo($outerdiv);
      var dim = {
	      width: $outerdiv[0].offsetWidth - $outerdiv[0].clientWidth,
	      height: $outerdiv[0].offsetHeight - $outerdiv[0].clientHeight
      };
      $innerdiv.remove();
      $outerdiv.remove();
      return dim;
    }

    function getColumnTotalWidth(includeScrollbar) {
      var totalWidth = 0;
      for (var i = 0, ii = columns.length; i < ii; i++) {
        var width = columns[i].width;
        totalWidth += width;
      }
      if (includeScrollbar) {
        totalWidth += scrollbarDimensions.width;
      }
      return totalWidth;
    }

    function getHeadersWidth() {
      var headersWidth = getColumnTotalWidth(!options.autoHeight);
      return Math.max(headersWidth, viewportW) + 1000;
    }

    function getCanvasWidth() {
      var availableWidth = viewportHasVScroll ? viewportW - scrollbarDimensions.width : viewportW;
      var rowWidth = 0;
      var i = columns.length;
      while (i--) {
        rowWidth += columns[i].width;
      }
      return options.fullWidthRows ? Math.max(rowWidth, availableWidth) : rowWidth;
    }

    function updateCanvasWidth(forceColumnWidthsUpdate) {
      var oldCanvasWidth = canvasWidth;
      canvasWidth = getCanvasWidth();

      if (canvasWidth != oldCanvasWidth) {
        $canvas.width(canvasWidth);
        $headerRow.width(canvasWidth);
        if (options.createFooterRow) { $footerRow.width(canvasWidth); }
        if (options.createPreHeaderPanel) { $preHeaderPanel.width(canvasWidth); }
        $headers.width(getHeadersWidth());
        viewportHasHScroll = (canvasWidth > viewportW - scrollbarDimensions.width);
      }

       var w=canvasWidth + (viewportHasVScroll ? scrollbarDimensions.width : 0);
       $headerRowSpacer.width(w);
       if (options.createFooterRow) { $footerRowSpacer.width(w); }
       if (options.createPreHeaderPanel) { $preHeaderPanelSpacer.width(w); }

      if (canvasWidth != oldCanvasWidth || forceColumnWidthsUpdate) {
        applyColumnWidths();
      }
      handleScroll(true);
    }

    function disableSelection($target) {
      if ($target && $target.jquery) {
        $target
            .attr("unselectable", "on")
            .css("MozUserSelect", "none")
            .on("selectstart.ui", function () {
              return false;
            }); // from jquery:ui.core.js 1.7.2
      }
    }

    function getMaxSupportedCssHeight() {
      var supportedHeight = 1000000;
      // FF reports the height back but still renders blank after ~6M px
      var testUpTo = navigator.userAgent.toLowerCase().match(/firefox/) ? 6000000 : 1000000000;
      var div = $("<div style='display:none' />").appendTo(document.body);

      while (true) {
        var test = supportedHeight * 2;
        div.css("height", test);
        if (test > testUpTo || div.height() !== test) {
          break;
        } else {
          supportedHeight = test;
        }
      }

      div.remove();
      return supportedHeight;
    }

    function getUID() {
      return uid;
    }

    function getHeaderColumnWidthDiff() {
      return headerColumnWidthDiff;
    }

    function getScrollbarDimensions() {
      return scrollbarDimensions;
    }

    // TODO:  this is static.  need to handle page mutation.
    function bindAncestorScrollEvents() {
      var elem = $canvas[0];
      while ((elem = elem.parentNode) != document.body && elem != null) {
        // bind to scroll containers only
        if (elem == $viewport[0] || elem.scrollWidth != elem.clientWidth || elem.scrollHeight != elem.clientHeight) {
          var $elem = $(elem);
          if (!$boundAncestors) {
            $boundAncestors = $elem;
          } else {
            $boundAncestors = $boundAncestors.add($elem);
          }
          $elem.on("scroll." + uid, handleActiveCellPositionChange);
        }
      }
    }

    function bindWindowResize() {
      $(window).on('resize', handleWindowResize)
    }

    function handleWindowResize() {
      //tooltip position issue on window resize https://gitlab.ekohe.com/ekohe/wulin/wulin_master/-/issues/266
      $(".tooltipped").map(function(i,item) {
        $(item).tooltip("destroy")
      })
      restoreButtons();
      updatePagerButtons();
      updateGridHeightInModal();
    }

    function updatePagerButtons() {
      var $gridContainer = $container.parent();
      for (var pagerItem of $gridContainer.find('.pager-item')) {
        var $pagerItem = $(pagerItem);
        // if pager item is empty, return directly.
        if ($pagerItem.is(':empty')) return;

        var pagerItemWidth = $pagerItem.width();
        var pagerItemPaddingWidth = parseInt($pagerItem.css('padding-left')) + parseInt($pagerItem.css('padding-right'));
        // we use the box-sizing: border-box. we have to subtract paddings(margins, if has), when we cal the content width.
        var pagerContentWidth = pagerItemWidth - pagerItemPaddingWidth;
        var $aTag = $($pagerItem.find('a'))
        var $aTagText = $($aTag.find('span'));
        var $aTagIcon = $($aTag.find('i'));
        var aTagIconWidth = $aTagIcon.width();
        var aTagTextMarginWidth = parseInt($aTagText.css('margin-left')) + parseInt($aTagText.css('margin-right'));
        var aTagCalculatedWidth = aTagIconWidth + $aTagText.width() + aTagTextMarginWidth;
        var $hintText = $($pagerItem.find('span')[0]);
        var hintTextWidth = $hintText.width();
        var aTagMarginWidth = parseInt($aTag.css('margin-left')) + parseInt($aTag.css('margin-right'));
        var contentWidth = hintTextWidth + aTagCalculatedWidth + aTagMarginWidth;
        var hintTextWithIconWidth = hintTextWidth + aTagIconWidth + aTagMarginWidth;
        if (pagerContentWidth < contentWidth){
          $aTag.find('span').hide()
        } else {
          $aTag.find('span').show()
        }
        if ($pagerItem.hasClass('selection')) {
          // Here we have to re-calculate the width of pager content
          var curPagerContentWidth = $pagerItem.width() - pagerItemPaddingWidth;
          // 120 is the 'n rows selected X' default width value
          if (curPagerContentWidth < Math.max(hintTextWithIconWidth, 120)) {
            $hintText.hide();
          } else {
            $hintText.show();
          }
        }
      }
    }

    function updateGridHeightInModal() {
      // check modal which is being opened
      if ($('.modal.open')) {
        WulinMaster.actions.BaseAction.setGridHeightInModal($('.modal.open'));
      }
    }

    function unbindAncestorScrollEvents() {
      if (!$boundAncestors) {
        return;
      }
      $boundAncestors.off("scroll." + uid);
      $boundAncestors = null;
    }

    function updateColumnHeader(columnId, title, toolTip) {
      if (!initialized) { return; }
      var idx = getColumnIndex(columnId);
      if (idx == null) {
        return;
      }

      var columnDef = columns[idx];
      var $header = $headers.children().eq(idx);
      if ($header) {
        if (title !== undefined) {
          columns[idx].name = title;
        }
        if (toolTip !== undefined) {
          columns[idx].toolTip = toolTip;
        }

        trigger(self.onBeforeHeaderCellDestroy, {
          "node": $header[0],
          "column": columnDef,
          "grid": self
        });

        $header
            .attr("title", toolTip || "")
            .children().eq(0).html(title);

        trigger(self.onHeaderCellRendered, {
          "node": $header[0],
          "column": columnDef,
          "grid": self
        });
      }
    }

    function getHeader() {
      return $headers[0];
    }

    function getHeaderColumn(columnIdOrIdx) {
      var idx = (typeof columnIdOrIdx === "number" ? columnIdOrIdx : getColumnIndex(columnIdOrIdx));
      var $rtn = $headers.children().eq(idx);
      return $rtn && $rtn[0];
    }

    function getHeaderRow() {
      return $headerRow[0];
    }

    function getFooterRow() {
      return $footerRow[0];
    }

    function getPreHeaderPanel() {
      return $preHeaderPanel[0];
    }

    function getHeaderRowColumn(columnIdOrIdx) {
      var idx = (typeof columnIdOrIdx === "number" ? columnIdOrIdx : getColumnIndex(columnIdOrIdx));
      var $rtn = $headerRow.children().eq(idx);
      return $rtn && $rtn[0];
    }

    function getFooterRowColumn(columnIdOrIdx) {
      var idx = (typeof columnIdOrIdx === "number" ? columnIdOrIdx : getColumnIndex(columnIdOrIdx));
      var $rtn = $footerRow.children().eq(idx);
      return $rtn && $rtn[0];
    }

    function createColumnHeaders() {
      function onMouseEnter() {
        if (columnResizeDragging) { return };

        // Ekohe Edit: Control visibility of sort/drag buttons
        if (!$(this).find('input').is(':focus')) {
          $(this).find('.slick-sort-indicator').show();
          $(this).find('.slick-show-more').show();
          $(this).find('.slick-sort-indicator').css({ right: '28px' });
          $(this).addClass("ui-state-hover");
        }
      }

      function onMouseLeave() {
        // Ekohe Edit: Control visibility of sort/drag button
        $(this).removeClass("ui-state-hover");
        if (!$(this).find('input').is(':focus')) {
          if ($(this).hasClass('slick-header-column-sorted')) {
            $(this).find('.slick-show-more').hide();
            $(this).find('.slick-sort-indicator').css({ right: '20px' });
          } else {
            $(this).find('.slick-show-more, .slick-sort-indicator').hide();
            $($(this).find('.dropdown-trigger')[0]).dropdown('close');
          }
        }
      }

      $headers.find(".slick-header-column")
        .each(function() {
          var columnDef = $(this).data("column");
          if (columnDef) {
            trigger(self.onBeforeHeaderCellDestroy, {
              "node": this,
              "column": columnDef,
              "grid": self
            });
          }
        });
      $headers.empty();
      $headers.width(getHeadersWidth());

      $headerRow.find(".slick-headerrow-column")
        .each(function() {
          var columnDef = $(this).data("column");
          if (columnDef) {
            trigger(self.onBeforeHeaderRowCellDestroy, {
              "node": this,
              "column": columnDef,
              "grid": self
            });
          }
        });
      $headerRow.empty();

      if (options.createFooterRow) {
        $footerRow.find(".slick-footerrow-column")
          .each(function() {
            var columnDef = $(this).data("column");
            if (columnDef) {
              trigger(self.onBeforeFooterRowCellDestroy, {
                "node": this,
                "column": columnDef
              });
            }
          });
        $footerRow.empty();
      }

      for (var i = 0; i < columns.length; i++) {
        var m = columns[i];

        // Ekohe Edit: Use new Material Design headers

        // var header = $("<div class='ui-state-default slick-header-column' />")
        //     .html("<span class='slick-column-name'>" + m.name + "</span>")
        //     .width(m.width - headerColumnWidthDiff)
        //     .attr("id", "" + uid + m.id)
        //     .attr("title", m.toolTip || "")
        //     .data("column", m)
        //     .addClass(m.headerCssClass || "")
        //     .appendTo($headers);

        var header = $("<div class='ui-state-default slick-header-column input-field' />")
            .width(m.width - headerColumnWidthDiff)
            .attr("id", "" + uid + m.id)
            .attr("title", m.toolTip || "")
            .data("column", m)
            .addClass(m.headerCssClass || "")
            .appendTo($headers);

        var randomIdForFilterInput = m.id + '-' + randomNumber();
        var headerColInput = $("<input type='text' />")
            .attr("id", "" + randomIdForFilterInput)
            .attr("data-col", "r" + i)
            .attr('data-id', '' + m.id)
            .appendTo(header);
        var headerColLabel = $("<label />")
            .html(m.name)
            .attr("for", "" + randomIdForFilterInput)
            .appendTo(header);

        // Ekohe Add: Align label to center
        headerColLabel.css('padding-left', 2);

        // Ekohe Add: Add left padding to the first columns
        if (i == 0) {
          headerColInput.css({ 'padding-left': '8px' });
          headerColLabel.css({ 'padding-left': '12px' });
        }
        headerColInput.width(header.width() - 30);

        if (options.enableColumnReorder || m.sortable) {
          header
            .on('mouseenter', onMouseEnter)
            .on('mouseleave', onMouseLeave);
        }

        // Ekohe More Action: (Hide, Move to the right, Move to the left)
        var $moreVertIcon = $("<i class='waves-effect waves-circle' />").addClass('material-icons').text('more_vert');
        var columnName = m.column_name;
        var $showMoreBtn = $(
          `<a href='javascript:void(0)' id='more_vert_${columnName}' class='dropdown-trigger' data-target='dropdown_${columnName}' />`
        );
        $showMoreBtn.append($moreVertIcon)
        var $showMoreTrigger = $(`<div class='slick-show-more' />`)
        $showMoreTrigger.append($showMoreBtn);
        var $moreContainer = $(
          `<ul id='dropdown_${columnName}' class='dropdown-content' />`
        );
        var $hideItem = $(
          `<li id='hide' data-column-id='${columnName}'><a href="javascript:void(0)"><i class="material-icons">block</i>Hide</a></li>`
        )
          .off('click')
          .on('click', function () {
            self.columnpicker.removeThisColumnEvent.apply($(this));
          });
        var $moveToRight = $(
          `<li id='move_to_right' data-column-id='${columnName}'><a href="javascript:void(0)"><i class="material-icons move_forward">forward</i>Move to the right</a></li>`
        )
          .off('click')
          .on('click', function () {
            self.columnpicker.moveThisColumnEvent.apply($(this));
            trigger(self.onColumnsReordered, {grid: self});
          });
        var $moveToLeft = $(
          `<li id='move_to_left' data-column-id='${columnName}'><a href="javascript:void(0)"><i class="material-icons move_back">forward</i>Move to the left</a></li>`
        )
          .off('click')
          .on('click', function () {
            self.columnpicker.moveThisColumnEvent.apply($(this));
            trigger(self.onColumnsReordered, {grid: self});
          });;
        $moreContainer
          .append($hideItem)
          .append($moveToRight)
          .append($moveToLeft)

        $showMoreTrigger.append($moreContainer);
        header.append($showMoreTrigger)
        $showMoreTrigger.hide();
        $showMoreBtn.dropdown({alignment: 'right'});
        var $sortableHandle = $(`<div class='slick-sortable-handle' />`)
        header.append($sortableHandle)
        if (m.sortable) {
          header.addClass("slick-header-sortable");
          // Ekohe Edit: Use material icon for sort indicator
          // header.append("<span class='slick-sort-indicator"
          //   + (options.numberedMultiColumnSort && !options.sortColNumberInSeparateSpan ? " slick-sort-indicator-numbered" : "" ) + "' />");
          // if (options.numberedMultiColumnSort && options.sortColNumberInSeparateSpan) { header.append("<span class='slick-sort-indicator-numbered' />"); }
          var $sortIcon = $('<i />').addClass('material-icons').text('arrow_downward');
          var $sortIndicator = $('<div />')
            .addClass('slick-sort-indicator')
            .css({right: '10px'})
            .append($sortIcon);
          header.append($sortIndicator);
        }

        // Ekohe Add: Disable filter input when 'filterable: false'
        if (m.filterable == false) {
          headerColInput.remove();
        }

        // Ekohe Add: Text field takes over the full row width and the icons disappear
        headerColInput.on('focus', function() {
          $(this).siblings('.slick-sort-indicator, .slick-show-more').hide();
          $(this).width($(this).parent().width());
          $(this).parent().css({'border':'none'});
        })

        // Ekohe Add: Show sort indicator when sorted
        headerColInput.on('blur', function() {
          if ($(this).parent().hasClass('slick-header-column-sorted')) {
            $(this).siblings('.slick-sort-indicator').css({right: '10px'}).show();
          }
        })

        trigger(self.onHeaderCellRendered, {
          "node": header[0],
          "column": m,
          "grid": self
        });

        if (options.showHeaderRow) {
          var headerRowCell = $("<div class='ui-state-default slick-headerrow-column l" + i + " r" + i + "'></div>")
              .data("column", m)
              .appendTo($headerRow);

          trigger(self.onHeaderRowCellRendered, {
            "node": headerRowCell[0],
            "column": m,
            "grid": self
          });
        }
        if (options.createFooterRow && options.showFooterRow) {
          var footerRowCell = $("<div class='ui-state-default slick-footerrow-column l" + i   + " r" + i + "'></div>")
              .data("column", m)
              .appendTo($footerRow);

          trigger(self.onFooterRowCellRendered, {
            "node": footerRowCell[0],
            "column": m
          });
        }
      }

      setSortColumns(sortColumns);
      setupColumnResize();
      if (options.enableColumnReorder) {
        if (typeof options.enableColumnReorder == 'function') {
            options.enableColumnReorder(self, $headers, headerColumnWidthDiff, setColumns, setupColumnResize, columns, getColumnIndex, uid, trigger);
        } else {
            setupColumnReorder();
        }
      }
    }

    /////////////////////////////////////////////////////////////////////////////
    // Ekohe Edit
    //   1. Material Design UI

    function setupColumnSort() {
      // Ekohe Edit: Material Design UI
      // $headers.click(function (e) {
      $headers.on('click', '.slick-sort-indicator', function(e) {
        if (columnResizeDragging) return;
        // temporary workaround for a bug in jQuery 1.7.1 (http://bugs.jquery.com/ticket/11328)
        e.metaKey = e.metaKey || e.ctrlKey;

        if ($(e.target).hasClass("slick-resizable-handle")) {
          return;
        }

        var $col = $(e.target).closest(".slick-header-column");
        if (!$col.length) {
          return;
        }

        var column = $col.data("column");
        if (column.sortable) {
          if (!getEditorLock().commitCurrentEdit()) {
            return;
          }

          var sortColumn = null;
          var i = 0;
          for (; i < sortColumns.length; i++) {
            if (sortColumns[i].columnId == column.id) {
              sortColumn = sortColumns[i];
              sortColumn.sortAsc = !sortColumn.sortAsc;
              break;
            }
          }
          var hadSortCol = !!sortColumn;

          if (options.tristateMultiColumnSort) {
              if (!sortColumn) {
                sortColumn = { columnId: column.id, sortAsc: column.defaultSortAsc };
              }
              if (hadSortCol && sortColumn.sortAsc) {
                // three state: remove sort rather than go back to ASC
                sortColumns.splice(i, 1);
                sortColumn = null;
              }
              if (!options.multiColumnSort) { sortColumns = []; }
              if (sortColumn && (!hadSortCol || !options.multiColumnSort)) {
                sortColumns.push(sortColumn);
              }
          } else {
              // legacy behaviour
              if (e.metaKey && options.multiColumnSort) {
                if (sortColumn) {
                  sortColumns.splice(i, 1);
                }
              }
              else {
                if ((!e.shiftKey && !e.metaKey) || !options.multiColumnSort) {
                  sortColumns = [];
                }

                if (!sortColumn) {
                  sortColumn = { columnId: column.id, sortAsc: column.defaultSortAsc };
                  sortColumns.push(sortColumn);
                } else if (sortColumns.length == 0) {
                  sortColumns.push(sortColumn);
                }
              }
          }

          setSortColumns(sortColumns);

          if (!options.multiColumnSort) {
            trigger(self.onSort, {
              multiColumnSort: false,
              sortCol: (sortColumns.length > 0 ? column : null),
              sortAsc: (sortColumns.length > 0 ? sortColumns[0].sortAsc : true),
              grid: self}, e);
          } else {
            trigger(self.onSort, {
              multiColumnSort: true,
              sortCols: $.map(sortColumns, function(col) {
                return {sortCol: columns[getColumnIndex(col.columnId)], sortAsc: col.sortAsc };
              }),
              grid: self}, e);
          }
        }
      });
    }

    function setupColumnReorder() {
      if (sortable!=null) { sortable.destroy(); }

      sortable = new Sortable($headers[0], {
        group: uid,
        sort: true,
        delay: 0,
        disabled: false,
        animation: 150,
        easing: "cubic-bezier(1, 0, 0, 1)",
        direction: 'horizontal',
        removeCloneOnHide: true,
        handle: '.slick-sortable-handle',
        onStart: function () {
          columnResizeDragging = true;
          $headers.find('.slick-show-more, .slick-sort-indicator').hide();
        },
        onEnd: function () {
          var reorderedIds = $.map($headers.children('.slick-header-column'), function(item, index) { return $(item).attr('id'); });
          var reorderedColumns = [];
          for (var i = 0; i < reorderedIds.length; i++) {
            reorderedColumns.push(columns[getColumnIndex(reorderedIds[i].replace(uid, ""))]);
          }
          setColumns(reorderedColumns);
          trigger(self.onColumnsReordered, {grid: self});
          setupColumnResize();
          updateCanvasWidth(false)
          columnResizeDragging = false;
        }
      }
      );
    }

    function setupColumnResize() {
      var $col, j, c, pageX, columnElements, minPageX, maxPageX, firstResizable, lastResizable;
      columnElements = $headers.children();
      columnElements.find(".slick-resizable-handle").remove();
      columnElements.each(function (i, e) {
        if (i >= columns.length) { return; }
        if (columns[i].resizable) {
          if (firstResizable === undefined) {
            firstResizable = i;
          }
          lastResizable = i;
        }
      });
      if (firstResizable === undefined) {
        return;
      }
      columnElements.each(function (i, e) {
        if (i >= columns.length) { return; }
        if (i < firstResizable || (options.forceFitColumns && i >= lastResizable)) {
          return;
        }
        $col = $(e);
        $("<div class='slick-resizable-handle' />")
            .appendTo(e)
            .on("dragstart", function (e, dd) {
              if (!getEditorLock().commitCurrentEdit()) {
                return false;
              }
              pageX = e.pageX;
              $(this).parent().addClass("slick-header-column-active");
              var shrinkLeewayOnRight = null, stretchLeewayOnRight = null;
              // lock each column's width option to current width
              columnElements.each(function (i, e) {
                if (i >= columns.length) { return; }
                columns[i].previousWidth = $(e).outerWidth();
              });
              if (options.forceFitColumns) {
                shrinkLeewayOnRight = 0;
                stretchLeewayOnRight = 0;
                // colums on right affect maxPageX/minPageX
                for (j = i + 1; j < columns.length; j++) {
                  c = columns[j];
                  if (c.resizable) {
                    if (stretchLeewayOnRight !== null) {
                      if (c.maxWidth) {
                        stretchLeewayOnRight += c.maxWidth - c.previousWidth;
                      } else {
                        stretchLeewayOnRight = null;
                      }
                    }
                    shrinkLeewayOnRight += c.previousWidth - Math.max(c.minWidth || 0, absoluteColumnMinWidth);
                  }
                }
              }
              var shrinkLeewayOnLeft = 0, stretchLeewayOnLeft = 0;
              for (j = 0; j <= i; j++) {
                // columns on left only affect minPageX
                c = columns[j];
                if (c.resizable) {
                  if (stretchLeewayOnLeft !== null) {
                    if (c.maxWidth) {
                      stretchLeewayOnLeft += c.maxWidth - c.previousWidth;
                    } else {
                      stretchLeewayOnLeft = null;
                    }
                  }
                  shrinkLeewayOnLeft += c.previousWidth - Math.max(c.minWidth || 0, absoluteColumnMinWidth);
                }
              }
              if (shrinkLeewayOnRight === null) {
                shrinkLeewayOnRight = 100000;
              }
              if (shrinkLeewayOnLeft === null) {
                shrinkLeewayOnLeft = 100000;
              }
              if (stretchLeewayOnRight === null) {
                stretchLeewayOnRight = 100000;
              }
              if (stretchLeewayOnLeft === null) {
                stretchLeewayOnLeft = 100000;
              }
              maxPageX = pageX + Math.min(shrinkLeewayOnRight, stretchLeewayOnLeft);
              minPageX = pageX - Math.min(shrinkLeewayOnLeft, stretchLeewayOnRight);
            })
            .on("drag", function (e, dd) {
              columnResizeDragging = true;
              var actualMinWidth, d = Math.min(maxPageX, Math.max(minPageX, e.pageX)) - pageX, x;
              if (d < 0) { // shrink column
                x = d;
                for (j = i; j >= 0; j--) {
                  c = columns[j];
                  if (c.resizable) {
                    actualMinWidth = Math.max(c.minWidth || 0, absoluteColumnMinWidth);
                    if (x && c.previousWidth + x < actualMinWidth) {
                      x += c.previousWidth - actualMinWidth;
                      c.width = actualMinWidth;
                    } else {
                      c.width = c.previousWidth + x;
                      x = 0;
                    }
                  }
                }

                if (options.forceFitColumns) {
                  x = -d;
                  for (j = i + 1; j < columns.length; j++) {
                    c = columns[j];
                    if (c.resizable) {
                      if (x && c.maxWidth && (c.maxWidth - c.previousWidth < x)) {
                        x -= c.maxWidth - c.previousWidth;
                        c.width = c.maxWidth;
                      } else {
                        c.width = c.previousWidth + x;
                        x = 0;
                      }
                    }
                  }
                }
              } else { // stretch column
                x = d;
                for (j = i; j >= 0; j--) {
                  c = columns[j];
                  if (c.resizable) {
                    if (x && c.maxWidth && (c.maxWidth - c.previousWidth < x)) {
                      x -= c.maxWidth - c.previousWidth;
                      c.width = c.maxWidth;
                    } else {
                      c.width = c.previousWidth + x;
                      x = 0;
                    }
                  }
                }

                if (options.forceFitColumns) {
                  x = -d;
                  for (j = i + 1; j < columns.length; j++) {
                    c = columns[j];
                    if (c.resizable) {
                      actualMinWidth = Math.max(c.minWidth || 0, absoluteColumnMinWidth);
                      if (x && c.previousWidth + x < actualMinWidth) {
                        x += c.previousWidth - actualMinWidth;
                        c.width = actualMinWidth;
                      } else {
                        c.width = c.previousWidth + x;
                        x = 0;
                      }
                    }
                  }
                }
              }
              applyColumnHeaderWidths();
              if (options.syncColumnCellResize) {
                applyColumnWidths();
              }
            })
            .on("dragend", function (e, dd) {
              var newWidth;
              $(this).parent().removeClass("slick-header-column-active");
              for (j = 0; j < columns.length; j++) {
                c = columns[j];
                newWidth = $(columnElements[j]).outerWidth();

                if (c.previousWidth !== newWidth && c.rerenderOnResize) {
                  invalidateAllRows();
                }
              }

              updateCanvasWidth(true);
              render();
              trigger(self.onColumnsResized, {grid: self});
              setTimeout(function () { columnResizeDragging = false; }, 300);
            });
      });
    }

    function getVBoxDelta($el) {
      var p = ["borderTopWidth", "borderBottomWidth", "paddingTop", "paddingBottom"];
      var delta = 0;
      $.each(p, function (n, val) {
        delta += parseFloat($el.css(val)) || 0;
      });
      return delta;
    }

    function measureCellPaddingAndBorder() {
      var el;
      var h = ["borderLeftWidth", "borderRightWidth", "paddingLeft", "paddingRight"];
      var v = ["borderTopWidth", "borderBottomWidth", "paddingTop", "paddingBottom"];

      // jquery prior to version 1.8 handles .width setter/getter as a direct css write/read
      // jquery 1.8 changed .width to read the true inner element width if box-sizing is set to border-box, and introduced a setter for .outerWidth
      // so for equivalent functionality, prior to 1.8 use .width, and after use .outerWidth
      var verArray = $.fn.jquery.split('.');
      jQueryNewWidthBehaviour = (verArray[0]==1 && verArray[1]>=8) ||  verArray[0] >=2;

      el = $("<div class='ui-state-default slick-header-column' style='visibility:hidden'>-</div>").appendTo($headers);
      headerColumnWidthDiff = headerColumnHeightDiff = 0;
      if (el.css("box-sizing") != "border-box" && el.css("-moz-box-sizing") != "border-box" && el.css("-webkit-box-sizing") != "border-box") {
        $.each(h, function (n, val) {
          headerColumnWidthDiff += parseFloat(el.css(val)) || 0;
        });
        $.each(v, function (n, val) {
          headerColumnHeightDiff += parseFloat(el.css(val)) || 0;
        });
      }
      el.remove();

      var r = $("<div class='slick-row' />").appendTo($canvas);
      el = $("<div class='slick-cell' id='' style='visibility:hidden'>-</div>").appendTo(r);
      cellWidthDiff = cellHeightDiff = 0;
      if (el.css("box-sizing") != "border-box" && el.css("-moz-box-sizing") != "border-box" && el.css("-webkit-box-sizing") != "border-box") {
        $.each(h, function (n, val) {
          cellWidthDiff += parseFloat(el.css(val)) || 0;
        });
        $.each(v, function (n, val) {
          cellHeightDiff += parseFloat(el.css(val)) || 0;
        });
      }
      r.remove();

      absoluteColumnMinWidth = Math.max(headerColumnWidthDiff, cellWidthDiff);
    }

    function createCssRules() {
      $style = $("<style type='text/css' rel='stylesheet' />").appendTo($("head"));
      var rowHeight = (options.rowHeight - cellHeightDiff);
      var rules = [
        "." + uid + " .slick-header-column { left: 1000px; }",
        "." + uid + " .slick-top-panel { height:" + options.topPanelHeight + "px; }",
        "." + uid + " .slick-preheader-panel { height:" + options.preHeaderPanelHeight + "px; }",
        "." + uid + " .slick-headerrow-columns { height:" + options.headerRowHeight + "px; }",
        "." + uid + " .slick-footerrow-columns { height:" + options.footerRowHeight + "px; }",
        "." + uid + " .slick-cell { height:" + rowHeight + "px; }",
        "." + uid + " .slick-row { height:" + options.rowHeight + "px; }"
      ];

      for (var i = 0; i < columns.length; i++) {
        rules.push("." + uid + " .l" + i + " { }");
        rules.push("." + uid + " .r" + i + " { }");
      }

      if ($style[0].styleSheet) { // IE
        $style[0].styleSheet.cssText = rules.join(" ");
      } else {
        $style[0].appendChild(document.createTextNode(rules.join(" ")));
      }
    }

    function getColumnCssRules(idx) {
      var i;
      if (!stylesheet) {
        var sheets = document.styleSheets;
        for (i = 0; i < sheets.length; i++) {
          if ((sheets[i].ownerNode || sheets[i].owningElement) == $style[0]) {
            stylesheet = sheets[i];
            break;
          }
        }

        if (!stylesheet) {
          throw new Error("Cannot find stylesheet.");
        }

        // find and cache column CSS rules
        columnCssRulesL = [];
        columnCssRulesR = [];
        var cssRules = (stylesheet.cssRules || stylesheet.rules);
        var matches, columnIdx;
        for (i = 0; i < cssRules.length; i++) {
          var selector = cssRules[i].selectorText;
          if (matches = /\.l\d+/.exec(selector)) {
            columnIdx = parseInt(matches[0].substr(2, matches[0].length - 2), 10);
            columnCssRulesL[columnIdx] = cssRules[i];
          } else if (matches = /\.r\d+/.exec(selector)) {
            columnIdx = parseInt(matches[0].substr(2, matches[0].length - 2), 10);
            columnCssRulesR[columnIdx] = cssRules[i];
          }
        }
      }

      return {
        "left": columnCssRulesL[idx],
        "right": columnCssRulesR[idx]
      };
    }

    function removeCssRules() {
      $style.remove();
      stylesheet = null;
    }

    function destroy() {
      getEditorLock().cancelCurrentEdit();
      trigger(self.onBeforeDestroy, {grid: self});

      var i = plugins.length;
      while(i--) {
        unregisterPlugin(plugins[i]);
      }

      if (options.enableColumnReorder) {
          $headers.filter(":ui-sortable").sortable("destroy");
      }

      unbindAncestorScrollEvents();
      $container.off(".slickgrid");
      removeCssRules();

      $canvas.off("draginit dragstart dragend drag");
      $container.empty().removeClass(uid);
    }


    //////////////////////////////////////////////////////////////////////////////////////////////
    // General

    function trigger(evt, args, e) {
      e = e || new Slick.EventData();
      args = args || {};
      args.grid = self;
      return evt.notify(args, e, self);
    }

    function getEditorLock() {
      return options.editorLock;
    }

    function getEditController() {
      return editController;
    }

    function getColumnIndex(id) {
      return columnsById[id];
    }

    function autosizeColumns() {
      var i, c,
          widths = [],
          shrinkLeeway = 0,
          total = 0,
          prevTotal,
          availWidth = viewportHasVScroll ? viewportW - scrollbarDimensions.width : viewportW;

      // https://gitlab.ekohe.com/ekohe/wulin/wulin_master/-/issues/191
      if (scrollbarDimensions && scrollbarDimensions.width > 0) {
        availWidth = availWidth - scrollbarDimensions.width - 8;
      }

      for (i = 0; i < columns.length; i++) {
        c = columns[i];
        widths.push(c.width);
        total += c.width;
        if (c.resizable) {
          shrinkLeeway += c.width - Math.max(c.minWidth, absoluteColumnMinWidth);
        }
      }

      // shrink
      prevTotal = total;
      while (total > availWidth && shrinkLeeway) {
        var shrinkProportion = (total - availWidth) / shrinkLeeway;
        for (i = 0; i < columns.length && total > availWidth; i++) {
          c = columns[i];
          var width = widths[i];
          if (!c.resizable || width <= c.minWidth || width <= absoluteColumnMinWidth) {
            continue;
          }
          var absMinWidth = Math.max(c.minWidth, absoluteColumnMinWidth);
          var shrinkSize = Math.floor(shrinkProportion * (width - absMinWidth)) || 1;
          shrinkSize = Math.min(shrinkSize, width - absMinWidth);
          total -= shrinkSize;
          shrinkLeeway -= shrinkSize;
          widths[i] -= shrinkSize;
        }
        if (prevTotal <= total) {  // avoid infinite loop
          break;
        }
        prevTotal = total;
      }

      // grow
      prevTotal = total;
      while (total < availWidth) {
        var growProportion = availWidth / total;
        for (i = 0; i < columns.length && total < availWidth; i++) {
          c = columns[i];
          var currentWidth = widths[i];
          var growSize;

          if (!c.resizable || c.maxWidth <= currentWidth) {
            growSize = 0;
          } else {
            growSize = Math.min(Math.floor(growProportion * currentWidth) - currentWidth, (c.maxWidth - currentWidth) || 1000000) || 1;
          }
          total += growSize;
          widths[i] += (total <= availWidth ? growSize : 0);
        }
        if (prevTotal >= total) {  // avoid infinite loop
          break;
        }
        prevTotal = total;
      }

      var reRender = false;
      for (i = 0; i < columns.length; i++) {
        if (columns[i].rerenderOnResize && columns[i].width != widths[i]) {
          reRender = true;
        }
        columns[i].width = widths[i];
      }

      applyColumnHeaderWidths();
      updateCanvasWidth(true);
      if (reRender) {
        invalidateAllRows();
        render();
      }
    }

    function applyColumnHeaderWidths() {
      if (!initialized) { return; }
      var h;

      for (var i = 0, headers = $headers.children(), ii = columns.length; i < ii; i++) {
        h = $(headers[i]);
        // Ekohe Add: Align label to center for MD
        if (jQueryNewWidthBehaviour) {
          if (h.outerWidth() !== columns[i].width) {
            h.outerWidth(columns[i].width);
          }
        } else {
          if (h.width() !== columns[i].width - headerColumnWidthDiff) {
            h.width(columns[i].width - headerColumnWidthDiff);
          }
        }
      }

      updateColumnCaches();
    }

    function applyColumnWidths() {
      var x = 0, w, rule;
      for (var i = 0; i < columns.length; i++) {
        w = columns[i].width;

        rule = getColumnCssRules(i);
        rule.left.style.left = x + "px";
        rule.right.style.right = (canvasWidth - x - w) + "px";

        x += columns[i].width;
      }
    }

    function setSortColumn(columnId, ascending) {
      setSortColumns([{ columnId: columnId, sortAsc: ascending}]);
    }

    function setSortColumns(cols) {
      sortColumns = cols;
      var numberCols = options.numberedMultiColumnSort && sortColumns.length > 1;
      var headerColumnEls = $headers.children();
      headerColumnEls
        .removeClass("slick-header-column-sorted")
        .find(".slick-sort-indicator")
           // Ekohe EDIT: Use mateiral icon for sort indicators
           // .removeClass("slick-sort-indicator-asc slick-sort-indicator-desc");
          .hide();
      headerColumnEls
        .find(".slick-sort-indicator-numbered")
          .text('');

      $.each(sortColumns, function(i, col) {
        if (col.sortAsc == null) {
          col.sortAsc = true;
        }
        var columnIndex = getColumnIndex(col.columnId);
        if (columnIndex != null) {

          // Ekohe Edit: Use mateiral icon for sort indicators

          // headerColumnEls.eq(columnIndex)
          //     .addClass("slick-header-column-sorted")
          //     .find(".slick-sort-indicator")
          //         .addClass(col.sortAsc ? "slick-sort-indicator-asc" : "slick-sort-indicator-desc");

          headerColumnEls.eq(columnIndex).find('.slick-sort-indicator .material-icons').remove();

          var $sortIcon = $('<i class="material-icons"></i>');
          $sortIcon.text(col.sortAsc ? 'arrow_upward' : 'arrow_downward')
          headerColumnEls.eq(columnIndex)
            .addClass("slick-header-column-sorted")
            .find(".slick-sort-indicator")
              // Ekohe Edit: Use mateiral icon for sort indicators
              // .addClass(col.sortAsc ? "slick-sort-indicator-asc" : "slick-sort-indicator-desc");
              .show().append($sortIcon);
          if (numberCols) {
            headerColumnEls.eq(columnIndex)
              .find(".slick-sort-indicator-numbered")
                .text(i+1);
          }
        }
      });
    }

    function getSortColumns() {
      return sortColumns;
    }

    //////////////////////////////////////////////////////////////////////////////////////////////
    // Ekohe Modify
    //   1. Show selection info on grid header

    function handleSelectedRangesChanged(e, ranges) {
      selectedRows = [];
      var hash = {};
      for (var i = 0; i < ranges.length; i++) {
        for (var j = ranges[i].fromRow; j <= ranges[i].toRow; j++) {
          if (!hash[j]) {  // prevent duplicates
            selectedRows.push(j);
            hash[j] = {};
          }
          for (var k = ranges[i].fromCell; k <= ranges[i].toCell; k++) {
            if (canCellBeSelected(j, k)) {
              hash[j][columns[k].id] = options.selectedCellCssClass;
            }
          }
        }
      }

      setCellCssStyles(options.selectedCellCssClass, hash);

      // Ekohe Add: Show selection info on grid header
      var itemCount = getSelectedRows().length;
      var $gridContainer = $container.parent();
      var $gridHeader = $gridContainer.find('.grid-header');
      if (itemCount >= 1) {
        var itemInfo = itemCount > 1 ? itemCount + ' rows' : '1 row';
        var text = itemInfo + ' selected';
        var selectionInfo = $gridContainer.find('.pager-item.selection');
        var textElement = $("<span/>").text(text);
        selectionInfo.empty().append(textElement);

        var clearLink = $("<a/>").attr('href', '#').addClass('clear').addClass('waves-effect');
        clearLink.append($("<i/>").addClass('material-icons').text('close'));
        clearLink.append($('<span/>').text('CLEAR SELECTION'));
        var buttonMode = $gridContainer.find('.toolbar-select').data('mode');
        var isSplitMode = buttonMode === 'split';
        var toolbarSelect = $gridContainer.find('.toolbar-select');

        clearLink.on('click', function() {
          if(isSplitMode) {
            toolbarSelect.attr('hidden', true);
          } else {
            toolbarSelect
              .find('.specific:not(.position_person_action)') // https://gitlab.ekohe.com/ekohe/hbs/cruise/-/issues/49#note_746740
              .addClass('toolbar_icon_disabled')
              .removeClass('specific')
              .addClass('static-waves-effect')
              .removeClass('waves-effect');
          }
          $gridContainer.find('.grid-header').removeClass('has-selected-rows');
          selectionModel.onSelectedRangesChanged.notify([]);

          updatePagerButtons();
          return false;
        })

        selectionInfo.append(clearLink);
        if(isSplitMode) {
          toolbarSelect.attr('hidden', false);
        } else {
          toolbarSelect
            .find('.toolbar_icon_disabled:not(.position_person_action)') // https://gitlab.ekohe.com/ekohe/hbs/cruise/-/issues/49#note_746740
            .addClass('specific')
            .removeClass('toolbar_icon_disabled')
            .removeClass('static-waves-effect')
            .addClass('waves-effect');
        }
        $gridContainer.closest('.modal').find('.confirm-btn').removeClass('disabled');
        $gridHeader.addClass('has-selected-rows');
      } else {
        $gridHeader.removeClass('has-selected-rows');
        $gridContainer.find('.pager-item.selection').text('');
        $gridContainer.closest('.modal').find('.confirm-btn').addClass('disabled');
        $(getActiveCellNode()).removeClass('active');
        activeCell, activeRow = null;
      }

      updatePagerButtons();

      trigger(self.onSelectedRowsChanged, {rows: getSelectedRows(), grid: self}, e);
    }

    function getColumns() {
      return columns;
    }

    function updateColumnCaches() {
      // Pre-calculate cell boundaries.
      columnPosLeft = [];
      columnPosRight = [];
      var x = 0;
      for (var i = 0, ii = columns.length; i < ii; i++) {
        columnPosLeft[i] = x;
        columnPosRight[i] = x + columns[i].width;
        x += columns[i].width;
      }
    }

    function setColumns(columnDefinitions) {
      columns = columnDefinitions;

      columnsById = {};
      for (var i = 0; i < columns.length; i++) {
        var m = columns[i] = $.extend({}, columnDefaults, columns[i]);
        columnsById[m.id] = i;
        if (m.minWidth && m.width < m.minWidth) {
          m.width = m.minWidth;
        }
        if (m.maxWidth && m.width > m.maxWidth) {
          m.width = m.maxWidth;
        }
      }

      updateColumnCaches();

      if (initialized) {
        invalidateAllRows();
        createColumnHeaders();
        removeCssRules();
        createCssRules();
        resizeCanvas();
        applyColumnWidths();
        handleScroll(true); // Ekohe Modify: Add argument true to force handleScroll
      }
    }

    function getOptions() {
      return options;
    }

    function setOptions(args, suppressRender) {
      if (!getEditorLock().commitCurrentEdit()) {
        return;
      }

      makeActiveCellNormal();

      if (options.enableAddRow !== args.enableAddRow) {
        invalidateRow(getDataLength());
      }

      options = $.extend(options, args);
      validateAndEnforceOptions();

      $viewport.css("overflow-y", options.autoHeight ? "hidden" : "auto");
      if (!suppressRender) { render(); }
    }

    function validateAndEnforceOptions() {
      if (options.autoHeight) {
        options.leaveSpaceForNewRows = false;
      }
    }

    function setData(newData, scrollToTop) {
      data = newData;
      invalidateAllRows();
      updateRowCount();
      if (scrollToTop) {
        scrollTo(0);
      }
    }

    function getData() {
      return data;
    }

    function getDataLength() {
      if (data.getLength) {
        return data.getLength();
      } else {
        return data.length;
      }
    }

    function getDataLengthIncludingAddNew() {
      return getDataLength() + (!options.enableAddRow ? 0
        : (!pagingActive || pagingIsLastPage ? 1 : 0)
      );
    }

    //////////////////////////////////////////////////////////////////////////////////////////////
    // Ekohe Modify
    //   1. Add process to get data form oldData when data variable is not set

    function getDataItem(i) {
      // Ekohe Edit: Get data form oldData when data variable is not set

      // if (data.getItem) {
      //   return data.getItem(i);
      // } else {
      //   return data[i];
      // }

      var item = null;
      if (data.getItem) {
        item = data.getItem(i);
      } else {
        item = data[i];
      }
      if(!item && self.loader && self.loader.oldData) {
        item = self.loader.oldData[i]
      }

      return item;
    }

    function getTopPanel() {
      return $topPanel[0];
    }

    function setTopPanelVisibility(visible) {
      if (options.showTopPanel != visible) {
        options.showTopPanel = visible;
        if (visible) {
          $topPanelScroller.slideDown("fast", resizeCanvas);
        } else {
          $topPanelScroller.slideUp("fast", resizeCanvas);
        }
      }
    }

    function setHeaderRowVisibility(visible) {
      if (options.showHeaderRow != visible) {
        options.showHeaderRow = visible;
        if (visible) {
          $headerRowScroller.slideDown("fast", resizeCanvas);
        } else {
          $headerRowScroller.slideUp("fast", resizeCanvas);
        }
      }
    }

    function setFooterRowVisibility(visible) {
      if (options.showFooterRow != visible) {
        options.showFooterRow = visible;
        if (visible) {
          $footerRowScroller.slideDown("fast", resizeCanvas);
        } else {
          $footerRowScroller.slideUp("fast", resizeCanvas);
        }
      }
    }

    function setPreHeaderPanelVisibility(visible) {
      if (options.showPreHeaderPanel != visible) {
        options.showPreHeaderPanel = visible;
        if (visible) {
          $preHeaderPanelScroller.slideDown("fast", resizeCanvas);
        } else {
          $preHeaderPanelScroller.slideUp("fast", resizeCanvas);
        }
      }
    }

    function getContainerNode() {
      return $container.get(0);
    }

    //////////////////////////////////////////////////////////////////////////////////////////////
    // Rendering / Scrolling

    function getRowTop(row) {
      return options.rowHeight * row - offset;
    }

    function getRowFromPosition(y) {
      return Math.floor((y + offset) / options.rowHeight);
    }

    function scrollTo(y) {
      y = Math.max(y, 0);
      y = Math.min(y, th - viewportH + (viewportHasHScroll ? scrollbarDimensions.height : 0));

      var oldOffset = offset;

      page = Math.min(n - 1, Math.floor(y / ph));
      offset = Math.round(page * cj);
      var newScrollTop = y - offset;

      if (offset != oldOffset) {
        var range = getVisibleRange(newScrollTop);
        cleanupRows(range);
        updateRowPositions();
      }

      if (prevScrollTop != newScrollTop) {
        vScrollDir = (prevScrollTop + oldOffset < newScrollTop + offset) ? 1 : -1;
        $viewport[0].scrollTop = (lastRenderedScrollTop = scrollTop = prevScrollTop = newScrollTop);

        trigger(self.onViewportChanged, {grid: self});
      }
    }

    function defaultFormatter(row, cell, value, columnDef, dataContext, grid) {
      if (value == null) {
        return "";
      } else {
        return (value + "").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
      }
    }

    function getFormatter(row, column) {
      var rowMetadata = data.getItemMetadata && data.getItemMetadata(row);

      // look up by id, then index
      var columnOverrides = rowMetadata &&
          rowMetadata.columns &&
          (rowMetadata.columns[column.id] || rowMetadata.columns[getColumnIndex(column.id)]);

      return (columnOverrides && columnOverrides.formatter) ||
          (rowMetadata && rowMetadata.formatter) ||
          column.formatter ||
          (options.formatterFactory && options.formatterFactory.getFormatter(column)) ||
          options.defaultFormatter;
    }

    function getEditor(row, cell) {
      var column = columns[cell];
      var rowMetadata = data.getItemMetadata && data.getItemMetadata(row);
      var columnMetadata = rowMetadata && rowMetadata.columns;

      // Ekohe Add: Support to specify editor type
      if (typeof column.editor === 'object') {
        if (column.editor.type) {
          return eval(column.editor.type);
        } else {
          return gridManager.getEditorForType(column.type);
        }
      }

      if (columnMetadata && columnMetadata[column.id] && columnMetadata[column.id].editor !== undefined) {
        return columnMetadata[column.id].editor;
      }
      if (columnMetadata && columnMetadata[cell] && columnMetadata[cell].editor !== undefined) {
        return columnMetadata[cell].editor;
      }

      return column.editor || (options.editorFactory && options.editorFactory.getEditor(column));
    }

    function getDataItemValueForColumn(item, columnDef) {
      if (options.dataItemColumnValueExtractor) {
        return options.dataItemColumnValueExtractor(item, columnDef);
      }
      return item[columnDef.field];
    }

    function appendRowHtml(stringArray, row, range, dataLength) {
      var d = getDataItem(row);
      var dataLoading = row < dataLength && !d;

      let rowCss = "slick-row" +
        (dataLoading ? " loading" : "") +
        (row === activeRow && options.showCellSelection ? " active" : "") +
        (row % 2 === 1 ? " odd" : " even");

      let extraRowClasses = [];
      self.onAddExtraRowClasses.notify({grid: self, row, extraRowClasses, rowData: d});
      rowCss = [rowCss, extraRowClasses].flat().join(' ');

      if (!d) {
        rowCss += " " + options.addNewRowCssClass;
      }

      var metadata = data.getItemMetadata && data.getItemMetadata(row);

      if (metadata && metadata.cssClasses) {
        rowCss += " " + metadata.cssClasses;
      }
      // Ekohe Edit: Add data-id attribute to each row for manipulating rows easily
      // stringArray.push("<div class='ui-widget-content " + rowCss + "' style='top:" + getRowTop(row) + "px'>");
      var dataId = d && d.id; // When fast scrolling, d.id will raise an error, so it's necessary to do the check whether d is present
      var startStringOfRowTagName = "<div class='ui-widget-content " +
                                    rowCss +
                                    "' style='top:" + getRowTop(row) +
                                    "px'" +
                                    (dataId ? " data-id=" + dataId : '') +
                                    ">"

      stringArray.push(startStringOfRowTagName);

      var colspan, m;
      for (var i = 0, ii = columns.length; i < ii; i++) {
        m = columns[i];
        colspan = 1;
        if (metadata && metadata.columns) {
          var columnData = metadata.columns[m.id] || metadata.columns[i];
          colspan = (columnData && columnData.colspan) || 1;
          if (colspan === "*") {
            colspan = ii - i;
          }
        }

        // Do not render cells outside of the viewport.

        // Ekohe Edit: Show row detail view
        // if (columnPosRight[Math.min(ii - 1, i + colspan - 1)] > range.leftPx) {
        if ((columnPosRight[Math.min(ii - 1, i + colspan - 1)] > range.leftPx) ||
            (m.id === '_detail_selector')) {
          if (columnPosLeft[i] > range.rightPx) {
            // All columns to the right are outside the range.
            break;
          }

          appendCellHtml(stringArray, row, i, colspan, d);
        }

        if (colspan > 1) {
          i += (colspan - 1);
        }
      }

      stringArray.push("</div>");
    }

    function appendCellHtml(stringArray, row, cell, colspan, item) {
      // stringArray: stringBuilder containing the HTML parts
      // row, cell: row and column index
      // colspan: HTML colspan
      // item: grid data for row

      var m = columns[cell];
      var cellCss = "slick-cell l" + cell + " r" + Math.min(columns.length - 1, cell + colspan - 1) +
          (m.cssClass ? " " + m.cssClass : "");
      if (row === activeRow && cell === activeCell && options.showCellSelection) {
        cellCss += (" active");
      }

      // TODO:  merge them together in the setter
      for (var key in cellCssClasses) {
        if (cellCssClasses[key][row] && cellCssClasses[key][row][m.id]) {
          cellCss += (" " + cellCssClasses[key][row][m.id]);
        }
      }

      var value = null, formatterResult = '';
      if (item) {
        value = getDataItemValueForColumn(item, m);
        formatterResult =  getFormatter(row, m)(row, cell, value, m, item, self);
        if (formatterResult === null || formatterResult === undefined) { formatterResult = ''; }
      }

      // get addl css class names from object type formatter return and from string type return of onBeforeAppendCell
      var addlCssClasses = trigger(self.onBeforeAppendCell, { row: row, cell: cell, grid: self, value: value, dataContext: item }) || '';
      addlCssClasses += (formatterResult && formatterResult.addClasses ? (addlCssClasses ? ' ' : '') + formatterResult.addClasses : '');

      let extraCellClasses = [];
      self.onAddExtraCellClasses.notify({grid: self, row, cell, extraCellClasses});
      cellCss = [cellCss, extraCellClasses].flat().join(' ');

      stringArray.push("<div class='" + cellCss + (addlCssClasses ? ' ' + addlCssClasses : '') + "'>");

      // if there is a corresponding row (if not, this is the Add New row or this data hasn't been loaded yet)
      if (item) {
        stringArray.push(Object.prototype.toString.call(formatterResult)  !== '[object Object]' ? formatterResult : formatterResult.text);
      }

      stringArray.push("</div>");

      rowsCache[row].cellRenderQueue.push(cell);
      rowsCache[row].cellColSpans[cell] = colspan;
    }


    function cleanupRows(rangeToKeep) {
      for (var i in rowsCache) {
        if (((i = parseInt(i, 10)) !== activeRow) && (i < rangeToKeep.top || i > rangeToKeep.bottom)) {
          removeRowFromCache(i);
        }
      }
      if (options.enableAsyncPostRenderCleanup) { startPostProcessingCleanup(); }
    }

    function invalidate() {
      updateRowCount();
      invalidateAllRows();
      render();
    }

    function invalidateAllRows() {
      if (currentEditor) {
        makeActiveCellNormal();
      }
      for (var row in rowsCache) {
        removeRowFromCache(row);
      }
      if (options.enableAsyncPostRenderCleanup) { startPostProcessingCleanup(); }
    }

    function queuePostProcessedRowForCleanup(cacheEntry, postProcessedRow, rowIdx) {
      postProcessgroupId++;

      // store and detach node for later async cleanup
      for (var columnIdx in postProcessedRow) {
        if (postProcessedRow.hasOwnProperty(columnIdx)) {
          postProcessedCleanupQueue.push({
            actionType: 'C',
            groupId: postProcessgroupId,
            node: cacheEntry.cellNodesByColumnIdx[ columnIdx | 0],
            columnIdx: columnIdx | 0,
            rowIdx: rowIdx
          });
        }
      }
      postProcessedCleanupQueue.push({
        actionType: 'R',
        groupId: postProcessgroupId,
        node: cacheEntry.rowNode
      });
      $(cacheEntry.rowNode).detach();
    }

    function queuePostProcessedCellForCleanup(cellnode, columnIdx, rowIdx) {
      postProcessedCleanupQueue.push({
        actionType: 'C',
        groupId: postProcessgroupId,
        node: cellnode,
        columnIdx: columnIdx,
        rowIdx: rowIdx
      });
      $(cellnode).detach();
    }

    function removeRowFromCache(row) {
      var cacheEntry = rowsCache[row];
      if (!cacheEntry) {
        return;
      }

      if (cacheEntry.rowNode) {
        if (rowNodeFromLastMouseWheelEvent === cacheEntry.rowNode) {
          cacheEntry.rowNode.style.display = 'none';
          zombieRowNodeFromLastMouseWheelEvent = rowNodeFromLastMouseWheelEvent;
          zombieRowCacheFromLastMouseWheelEvent = cacheEntry;
          zombieRowPostProcessedFromLastMouseWheelEvent = postProcessedRows[row];
          // ignore post processing cleanup in this case - it will be dealt with later
        } else {
          if (options.enableAsyncPostRenderCleanup && postProcessedRows[row]) {
            queuePostProcessedRowForCleanup(cacheEntry, postProcessedRows[row], row);
          } else {
            if(cacheEntry.rowNode.parentNode == $canvas[0]) {
              $canvas[0].removeChild(cacheEntry.rowNode);
            }
          }
        }
      }

      delete rowsCache[row];
      delete postProcessedRows[row];
      renderedRows--;
      counter_rows_removed++;
    }

    function invalidateRows(rows) {
      var i, rl;
      if (!rows || !rows.length) {
        return;
      }
      vScrollDir = 0;
      rl = rows.length;
      for (i = 0;  i < rl; i++) {
        if (currentEditor && activeRow === rows[i]) {
          makeActiveCellNormal();
        }
        if (rowsCache[rows[i]]) {
          removeRowFromCache(rows[i]);
        }
      }
      if (options.enableAsyncPostRenderCleanup) { startPostProcessingCleanup(); }
    }

    function invalidateRow(row) {
      if (!row && row !== 0) { return; }
      invalidateRows([row]);
    }

    function applyFormatResultToCellNode(formatterResult, cellNode, suppressRemove) {
        if (formatterResult === null || formatterResult === undefined) { formatterResult = ''; }
        if (Object.prototype.toString.call(formatterResult)  !== '[object Object]') {
            cellNode.innerHTML = formatterResult;
            return;
        }
        cellNode.innerHTML = formatterResult.text;
        if (formatterResult.removeClasses && !suppressRemove) {
            $(cellNode).removeClass(formatterResult.removeClasses);
        }
        if (formatterResult.addClasses) {
            $(cellNode).addClass(formatterResult.addClasses);
        }
    }

    function updateCell(row, cell) {
      var cellNode = getCellNode(row, cell);
      if (!cellNode) {
        return;
      }

      var m = columns[cell], d = getDataItem(row);
      if (currentEditor && activeRow === row && activeCell === cell) {
        currentEditor.loadValue(d);
      } else {
        var formatterResult =  d ? getFormatter(row, m)(row, cell, getDataItemValueForColumn(d, m), m, d, self) : "";
        applyFormatResultToCellNode(formatterResult, cellNode);
        invalidatePostProcessingResults(row);
      }
    }

    function updateRow(row) {
      var cacheEntry = rowsCache[row];
      if (!cacheEntry) {
        return;
      }

      ensureCellNodesInRowsCache(row);

      var formatterResult, d = getDataItem(row);

      for (var columnIdx in cacheEntry.cellNodesByColumnIdx) {
        if (!cacheEntry.cellNodesByColumnIdx.hasOwnProperty(columnIdx)) {
          continue;
        }

        columnIdx = columnIdx | 0;
        var m = columns[columnIdx],
            node = cacheEntry.cellNodesByColumnIdx[columnIdx];

        if (row === activeRow && columnIdx === activeCell && currentEditor) {
          currentEditor.loadValue(d);
        } else if (d) {
          formatterResult =  getFormatter(row, m)(row, columnIdx, getDataItemValueForColumn(d, m), m, d, self);
          applyFormatResultToCellNode(formatterResult, node);
        } else {
          node.innerHTML = "";
        }
      }

      invalidatePostProcessingResults(row);
    }

    ////////////////////////////////////////////////////////////////////////////////
    // Ekohe Edit
    //   1. Ekohe Edit: Material Dedign UI

    function getViewportHeight() {
      return parseFloat($.css($container[0], "height", true)) -
        parseFloat($.css($container[0], "paddingTop", true)) -
        parseFloat($.css($container[0], "paddingBottom", true)) -
        // Ekohe Edit: Material Dedign UI
        // parseFloat($.css($headerScroller[0], "height")) - getVBoxDelta($headerScroller) -
        parseFloat($.css($headers[0], "height")) - getVBoxDelta($headerScroller) -
        (options.showTopPanel ? options.topPanelHeight + getVBoxDelta($topPanelScroller) : 0) -
        (options.showHeaderRow ? options.headerRowHeight + getVBoxDelta($headerRowScroller) : 0) -
        (options.createFooterRow && options.showFooterRow ? options.footerRowHeight + getVBoxDelta($footerRowScroller) : 0) -
        (options.createPreHeaderPanel && options.showPreHeaderPanel ? options.preHeaderPanelHeight + getVBoxDelta($preHeaderPanelScroller) : 0);
    }

    function resizeCanvas() {
      if (!initialized) { return; }
      if (options.autoHeight) {
        viewportH = options.rowHeight * getDataLengthIncludingAddNew();
      } else {
        viewportH = getViewportHeight();
      }

      numVisibleRows = Math.ceil(viewportH / options.rowHeight);
      viewportW = parseFloat($.css($container[0], "width", true));
      if (!options.autoHeight) {
        $viewport.height(viewportH);
      }

      if (!scrollbarDimensions || !scrollbarDimensions.width) {
        scrollbarDimensions = measureScrollbar();
      }

      if (options.forceFitColumns) {
        autosizeColumns();
      }

      updateRowCount();
      handleScroll();
      // Since the width has changed, force the render() to reevaluate virtually rendered cells.
      lastRenderedScrollLeft = -1;
      render();
    }

    function updatePagingStatusFromView( pagingInfo ) {
        pagingActive = (pagingInfo.pageSize !== 0);
        pagingIsLastPage = (pagingInfo.pageNum == pagingInfo.totalPages - 1);
    }

    function updateRowCount() {
      if (!initialized) { return; }

      var dataLength = getDataLength();
      var dataLengthIncludingAddNew = getDataLengthIncludingAddNew();
      var numberOfRows = dataLengthIncludingAddNew +
          (options.leaveSpaceForNewRows ? numVisibleRows - 1 : 0);

      var oldViewportHasVScroll = viewportHasVScroll;
      // with autoHeight, we do not need to accommodate the vertical scroll bar
      viewportHasVScroll = options.alwaysShowVerticalScroll || !options.autoHeight && (numberOfRows * options.rowHeight > viewportH);
      viewportHasHScroll = (canvasWidth > viewportW - scrollbarDimensions.width);

      makeActiveCellNormal();

      // remove the rows that are now outside of the data range
      // this helps avoid redundant calls to .removeRow() when the size of the data decreased by thousands of rows
      var r1 = dataLength - 1;
      for (var i in rowsCache) {
        if (i > r1) {
          removeRowFromCache(i);
        }
      }
      if (options.enableAsyncPostRenderCleanup) { startPostProcessingCleanup(); }

      if (activeCellNode && activeRow > r1) {
        resetActiveCell();
      }

      var oldH = h;
      th = Math.max(options.rowHeight * numberOfRows, viewportH - scrollbarDimensions.height);
      if (th < maxSupportedCssHeight) {
        // just one page
        h = ph = th;
        n = 1;
        cj = 0;
      } else {
        // break into pages
        h = maxSupportedCssHeight;
        ph = h / 100;
        n = Math.floor(th / ph);
        cj = (th - h) / (n - 1);
      }

      if (h !== oldH) {
        $canvas.css("height", h);
        scrollTop = $viewport[0].scrollTop;
      }

      var oldScrollTopInRange = (scrollTop + offset <= th - viewportH);

      if (th == 0 || scrollTop == 0) {
        page = offset = 0;
      } else if (oldScrollTopInRange) {
        // maintain virtual position
        scrollTo(scrollTop + offset);
      } else {
        // scroll to bottom
        scrollTo(th - viewportH);
      }

      if (h != oldH && options.autoHeight) {
        resizeCanvas();
      }

      if (options.forceFitColumns && oldViewportHasVScroll != viewportHasVScroll) {
        autosizeColumns();
      }
      updateCanvasWidth(false);
    }

    function getVisibleRange(viewportTop, viewportLeft) {
      if (viewportTop == null) {
        viewportTop = scrollTop;
      }
      if (viewportLeft == null) {
        viewportLeft = scrollLeft;
      }

      return {
        top: getRowFromPosition(viewportTop),
        bottom: getRowFromPosition(viewportTop + viewportH) + 1,
        leftPx: viewportLeft,
        rightPx: viewportLeft + viewportW
      };
    }

    function getRenderedRange(viewportTop, viewportLeft) {
      var range = getVisibleRange(viewportTop, viewportLeft);
      var buffer = Math.round(viewportH / options.rowHeight);
      var minBuffer = options.minRowBuffer;

      if (vScrollDir == -1) {
        range.top -= buffer;
        range.bottom += minBuffer;
      } else if (vScrollDir == 1) {
        range.top -= minBuffer;
        range.bottom += buffer;
      } else {
        range.top -= minBuffer;
        range.bottom += minBuffer;
      }

      range.top = Math.max(0, range.top);
      range.bottom = Math.min(getDataLengthIncludingAddNew() - 1, range.bottom);

      range.leftPx -= viewportW;
      range.rightPx += viewportW;

      range.leftPx = Math.max(0, range.leftPx);
      range.rightPx = Math.min(canvasWidth, range.rightPx);

      return range;
    }

    function ensureCellNodesInRowsCache(row) {
      var cacheEntry = rowsCache[row];
      if (cacheEntry) {
        if (cacheEntry.cellRenderQueue.length) {
          var lastChild = cacheEntry.rowNode.lastChild;
          while (cacheEntry.cellRenderQueue.length) {
            var columnIdx = cacheEntry.cellRenderQueue.pop();
            cacheEntry.cellNodesByColumnIdx[columnIdx] = lastChild;
            lastChild = lastChild.previousSibling;
          }
        }
      }
    }

    function cleanUpCells(range, row) {
      var totalCellsRemoved = 0;
      var cacheEntry = rowsCache[row];

      // Remove cells outside the range.
      var cellsToRemove = [];
      for (var i in cacheEntry.cellNodesByColumnIdx) {
        // I really hate it when people mess with Array.prototype.
        if (!cacheEntry.cellNodesByColumnIdx.hasOwnProperty(i)) {
          continue;
        }

        // Ekohe Add: Avoid removing row detail view
        if ($(cacheEntry.cellNodesByColumnIdx[i]).hasClass('dynamic-cell-detail')) {
          continue;
        }

        // This is a string, so it needs to be cast back to a number.
        i = i | 0;

        var colspan = cacheEntry.cellColSpans[i];
        if (columnPosLeft[i] > range.rightPx ||
          columnPosRight[Math.min(columns.length - 1, i + colspan - 1)] < range.leftPx) {
          if (!(row == activeRow && i == activeCell)) {
            cellsToRemove.push(i);
          }
        }
      }

      var cellToRemove, node;
      postProcessgroupId++;
      while ((cellToRemove = cellsToRemove.pop()) != null) {
        node = cacheEntry.cellNodesByColumnIdx[cellToRemove];
        if (options.enableAsyncPostRenderCleanup && postProcessedRows[row] && postProcessedRows[row][cellToRemove]) {
          queuePostProcessedCellForCleanup(node, cellToRemove, row);
        } else {
          cacheEntry.rowNode.removeChild(node);
        }

        delete cacheEntry.cellColSpans[cellToRemove];
        delete cacheEntry.cellNodesByColumnIdx[cellToRemove];
        if (postProcessedRows[row]) {
          delete postProcessedRows[row][cellToRemove];
        }
        totalCellsRemoved++;
      }
    }

    function cleanUpAndRenderCells(range) {
      var cacheEntry;
      var stringArray = [];
      var processedRows = [];
      var cellsAdded;
      var totalCellsAdded = 0;
      var colspan;

      for (var row = range.top, btm = range.bottom; row <= btm; row++) {
        cacheEntry = rowsCache[row];
        if (!cacheEntry) {
          continue;
        }

        // cellRenderQueue populated in renderRows() needs to be cleared first
        ensureCellNodesInRowsCache(row);

        cleanUpCells(range, row);

        // Render missing cells.
        cellsAdded = 0;

        var metadata = data.getItemMetadata && data.getItemMetadata(row);
        metadata = metadata && metadata.columns;

        var d = getDataItem(row);

        // TODO:  shorten this loop (index? heuristics? binary search?)
        for (var i = 0, ii = columns.length; i < ii; i++) {
          // Cells to the right are outside the range.
          if (columnPosLeft[i] > range.rightPx) {
            break;
          }

          // Already rendered.
          if ((colspan = cacheEntry.cellColSpans[i]) != null) {
            i += (colspan > 1 ? colspan - 1 : 0);
            continue;
          }

          colspan = 1;
          if (metadata) {
            var columnData = metadata[columns[i].id] || metadata[i];
            colspan = (columnData && columnData.colspan) || 1;
            if (colspan === "*") {
              colspan = ii - i;
            }
          }

          if (columnPosRight[Math.min(ii - 1, i + colspan - 1)] > range.leftPx) {
            appendCellHtml(stringArray, row, i, colspan, d);
            cellsAdded++;
          }

          i += (colspan > 1 ? colspan - 1 : 0);
        }

        if (cellsAdded) {
          totalCellsAdded += cellsAdded;
          processedRows.push(row);
        }
      }

      if (!stringArray.length) {
        return;
      }

      var x = document.createElement("div");
      x.innerHTML = stringArray.join("");

      var processedRow;
      var node;
      while ((processedRow = processedRows.pop()) != null) {
        cacheEntry = rowsCache[processedRow];
        var columnIdx;
        while ((columnIdx = cacheEntry.cellRenderQueue.pop()) != null) {
          node = x.lastChild;
          cacheEntry.rowNode.appendChild(node);
          cacheEntry.cellNodesByColumnIdx[columnIdx] = node;
        }
      }
    }

    function renderRows(range) {
      var parentNode = $canvas[0],
          stringArray = [],
          rows = [],
          needToReselectCell = false,
          dataLength = getDataLength();

      for (var i = range.top, ii = range.bottom; i <= ii; i++) {
        if (rowsCache[i]) {
          continue;
        }
        renderedRows++;
        rows.push(i);

        // Create an entry right away so that appendRowHtml() can
        // start populatating it.
        rowsCache[i] = {
          "rowNode": null,

          // ColSpans of rendered cells (by column idx).
          // Can also be used for checking whether a cell has been rendered.
          "cellColSpans": [],

          // Cell nodes (by column idx).  Lazy-populated by ensureCellNodesInRowsCache().
          "cellNodesByColumnIdx": [],

          // Column indices of cell nodes that have been rendered, but not yet indexed in
          // cellNodesByColumnIdx.  These are in the same order as cell nodes added at the
          // end of the row.
          "cellRenderQueue": []
        };

        appendRowHtml(stringArray, i, range, dataLength);
        if (activeCellNode && activeRow === i) {
          needToReselectCell = true;
        }
        counter_rows_rendered++;
      }

      if (!rows.length) { return; }

      var x = document.createElement("div");
      x.innerHTML = stringArray.join("");

      for (var i = 0, ii = rows.length; i < ii; i++) {
        rowsCache[rows[i]].rowNode = parentNode.appendChild(x.firstChild);
      }

      if (needToReselectCell) {
        activeCellNode = getCellNode(activeRow, activeCell);
      }
    }

    function startPostProcessing() {
      if (!options.enableAsyncPostRender) {
        return;
      }
      clearTimeout(h_postrender);
      h_postrender = setTimeout(asyncPostProcessRows, options.asyncPostRenderDelay);
    }

    function startPostProcessingCleanup() {
      if (!options.enableAsyncPostRenderCleanup) {
        return;
      }
      clearTimeout(h_postrenderCleanup);
      h_postrenderCleanup = setTimeout(asyncPostProcessCleanupRows, options.asyncPostRenderCleanupDelay);
    }

    function invalidatePostProcessingResults(row) {
      // change status of columns to be re-rendered
      for (var columnIdx in postProcessedRows[row]) {
        if (postProcessedRows[row].hasOwnProperty(columnIdx)) {
          postProcessedRows[row][columnIdx] = 'C';
        }
      }
      postProcessFromRow = Math.min(postProcessFromRow, row);
      postProcessToRow = Math.max(postProcessToRow, row);
      startPostProcessing();
    }

    function updateRowPositions() {
      for (var row in rowsCache) {
        rowsCache[row].rowNode.style.top = getRowTop(row) + "px";
      }
    }

    function render() {
      if (!initialized) { return; }
      var visible = getVisibleRange();
      var rendered = getRenderedRange();

      // remove rows no longer in the viewport
      cleanupRows(rendered);

      // add new rows & missing cells in existing rows
      if (lastRenderedScrollLeft != scrollLeft) {
        cleanUpAndRenderCells(rendered);
      }

      // render missing rows
      renderRows(rendered);

      postProcessFromRow = visible.top;
      postProcessToRow = Math.min(getDataLengthIncludingAddNew() - 1, visible.bottom);
      startPostProcessing();

      lastRenderedScrollTop = scrollTop;
      lastRenderedScrollLeft = scrollLeft;
      h_render = null;

      // Ekohe Add: Format processing

      // Filtered columns
      renderFilteredInputs();

      // First column cells
      $container.find('.slick-cell.l0 > span:first-child').css({'padding-left': '10px'});
    }

    function renderFilteredInputs() {
      var $filteredInputs = getFilteredInputs();
      if ($filteredInputs.length != 0) {
        $.each($filteredInputs, function( index, value ) {
          $container
            .find('.slick-cell.' + value.getAttribute('data-col'))
            .addClass('filtered');
        });
      }
    }

    // Trigger the option DOM after check, such that we can receive a signal that select rows is change outside of WulinMaster
    function triggerDOM() {
      var triggerDomElement = options.checkbox.triggerAfterCheck
      var triggerEventName = options.checkbox.triggerEventName
      if (triggerDomElement != null && triggerEventName != null) {
        const event = new Event(triggerEventName)
        $(triggerDomElement).each((_, e) => {
          e.dispatchEvent(event)
        })
      }
    }

    function handleHeaderScroll() {
      handleElementScroll($headerScroller[0]);
    }

    function handleHeaderRowScroll() {
      handleElementScroll($headerRowScroller[0]);
    }

    function handleFooterRowScroll() {
      handleElementScroll($footerRowScroller[0]);
    }

    function handlePreHeaderPanelScroll() {
      handleElementScroll($preHeaderPanelScroller[0]);
    }

    function handleElementScroll(element) {
      var scrollLeft = element.scrollLeft;
      if (scrollLeft != $viewport[0].scrollLeft) {
        $viewport[0].scrollLeft = scrollLeft;
      }
    }

    //////////////////////////////////////////////////////////////////////////////////////////////
    // Ekohe Modify
    //   1. Add new params forceScrolling to decide if force update scrollLeft/scollTop
    //   2. Add forceScrolling to every condition

    function handleScroll(forceScrolling) {
      // Ekohe Added: set forceScrolling to false as default
      forceScrolling = forceScrolling || false;

      scrollTop = $viewport[0].scrollTop;
      scrollLeft = $viewport[0].scrollLeft;
      var vScrollDist = Math.abs(scrollTop - prevScrollTop);
      var hScrollDist = Math.abs(scrollLeft - prevScrollLeft);

      if (hScrollDist || forceScrolling) {
        prevScrollLeft = scrollLeft;
        $headerScroller[0].scrollLeft = scrollLeft;
        $topPanelScroller[0].scrollLeft = scrollLeft;
        $headerRowScroller[0].scrollLeft = scrollLeft;
        if (options.createFooterRow) {
          $footerRowScroller[0].scrollLeft = scrollLeft;
        }
        if (options.createPreHeaderPanel) {
          $preHeaderPanelScroller[0].scrollLeft = scrollLeft;
        }
      }

      if (vScrollDist || forceScrolling) {
        vScrollDir = prevScrollTop < scrollTop ? 1 : -1;
        prevScrollTop = scrollTop;

        // switch virtual pages if needed
        if (vScrollDist < viewportH) {
          scrollTo(scrollTop + offset);
        } else {
          var oldOffset = offset;
          if (h == viewportH) {
            page = 0;
          } else {
            page = Math.min(n - 1, Math.floor(scrollTop * ((th - viewportH) / (h - viewportH)) * (1 / ph)));
          }
          offset = Math.round(page * cj);
          if (oldOffset != offset) {
            invalidateAllRows();
          }
        }
      }

      if (hScrollDist || vScrollDist || forceScrolling) {
        if (h_render) {
          clearTimeout(h_render);
        }

        if (Math.abs(lastRenderedScrollTop - scrollTop) > 20 ||
            Math.abs(lastRenderedScrollLeft - scrollLeft) > 20) {
          if (options.forceSyncScrolling || (
              Math.abs(lastRenderedScrollTop - scrollTop) < viewportH &&
              Math.abs(lastRenderedScrollLeft - scrollLeft) < viewportW)) {
            render();
          } else {
            h_render = setTimeout(render, 50);
          }

          trigger(self.onViewportChanged, {grid: self});
        }
      }

      trigger(self.onScroll, {scrollLeft: scrollLeft, scrollTop: scrollTop, grid: self});
    }

    function asyncPostProcessRows() {
      var dataLength = getDataLength();
      while (postProcessFromRow <= postProcessToRow) {
        var row = (vScrollDir >= 0) ? postProcessFromRow++ : postProcessToRow--;
        var cacheEntry = rowsCache[row];
        if (!cacheEntry || row >= dataLength) {
          continue;
        }

        if (!postProcessedRows[row]) {
          postProcessedRows[row] = {};
        }

        ensureCellNodesInRowsCache(row);
        for (var columnIdx in cacheEntry.cellNodesByColumnIdx) {
          if (!cacheEntry.cellNodesByColumnIdx.hasOwnProperty(columnIdx)) {
            continue;
          }

          columnIdx = columnIdx | 0;

          var m = columns[columnIdx];
          var processedStatus = postProcessedRows[row][columnIdx]; // C=cleanup and re-render, R=rendered
          if (m.asyncPostRender && processedStatus !== 'R') {
            var node = cacheEntry.cellNodesByColumnIdx[columnIdx];
            if (node) {
              m.asyncPostRender(node, row, getDataItem(row), m, (processedStatus === 'C'));
            }
            postProcessedRows[row][columnIdx] = 'R';
          }
        }

        h_postrender = setTimeout(asyncPostProcessRows, options.asyncPostRenderDelay);
        return;
      }
    }

    function asyncPostProcessCleanupRows() {
      if (postProcessedCleanupQueue.length > 0) {
        var groupId = postProcessedCleanupQueue[0].groupId;

        // loop through all queue members with this groupID
        while (postProcessedCleanupQueue.length > 0 && postProcessedCleanupQueue[0].groupId == groupId) {
          var entry = postProcessedCleanupQueue.shift();
          if (entry.actionType == 'R') {
            $(entry.node).remove();
          }
          if (entry.actionType == 'C') {
            var column = columns[entry.columnIdx];
            if (column.asyncPostRenderCleanup && entry.node) {
              // cleanup must also remove element
              column.asyncPostRenderCleanup(entry.node, entry.rowIdx, column);
            }
          }
        }

        // call this function again after the specified delay
        h_postrenderCleanup = setTimeout(asyncPostProcessCleanupRows, options.asyncPostRenderCleanupDelay);
      }
    }

    function updateCellCssStylesOnRenderedRows(addedHash, removedHash) {
      var node, columnId, addedRowHash, removedRowHash;
      for (var row in rowsCache) {
        removedRowHash = removedHash && removedHash[row];
        addedRowHash = addedHash && addedHash[row];

        if (removedRowHash) {
          for (columnId in removedRowHash) {
            if (!addedRowHash || removedRowHash[columnId] != addedRowHash[columnId]) {
              node = getCellNode(row, getColumnIndex(columnId));
              if (node) {
                $(node).removeClass(removedRowHash[columnId]);
              }
            }
          }
        }

        if (addedRowHash) {
          for (columnId in addedRowHash) {
            if (!removedRowHash || removedRowHash[columnId] != addedRowHash[columnId]) {
              node = getCellNode(row, getColumnIndex(columnId));
              if (node) {
                $(node).addClass(addedRowHash[columnId]);
              }
            }
          }
        }
      }
    }

    function addCellCssStyles(key, hash) {
      if (cellCssClasses[key]) {
        throw new Error("addCellCssStyles: cell CSS hash with key '" + key + "' already exists.");
      }

      cellCssClasses[key] = hash;
      updateCellCssStylesOnRenderedRows(hash, null);

      trigger(self.onCellCssStylesChanged, { "key": key, "hash": hash, "grid": self });
    }

    function removeCellCssStyles(key) {
      if (!cellCssClasses[key]) {
        return;
      }

      updateCellCssStylesOnRenderedRows(null, cellCssClasses[key]);
      delete cellCssClasses[key];

      trigger(self.onCellCssStylesChanged, { "key": key, "hash": null, "grid": self });
    }

    function setCellCssStyles(key, hash) {
      var prevHash = cellCssClasses[key];

      cellCssClasses[key] = hash;
      updateCellCssStylesOnRenderedRows(hash, prevHash);

      trigger(self.onCellCssStylesChanged, { "key": key, "hash": hash, "grid": self });
    }

    function getCellCssStyles(key) {
      return cellCssClasses[key];
    }

    function flashCell(row, cell, speed) {
      speed = speed || 100;
      if (rowsCache[row]) {
        var $cell = $(getCellNode(row, cell));

        function toggleCellClass(times) {
          if (!times) {
            return;
          }
          setTimeout(function () {
                $cell.queue(function () {
                  $cell.toggleClass(options.cellFlashingCssClass).dequeue();
                  toggleCellClass(times - 1);
                });
              },
              speed);
        }

        toggleCellClass(4);
      }
    }

    //////////////////////////////////////////////////////////////////////////////////////////////
    // Interactivity

    function handleMouseWheel(e) {
      var rowNode = $(e.target).closest(".slick-row")[0];
      if (rowNode != rowNodeFromLastMouseWheelEvent) {
        if (zombieRowNodeFromLastMouseWheelEvent && zombieRowNodeFromLastMouseWheelEvent != rowNode) {
          if (options.enableAsyncPostRenderCleanup && zombieRowPostProcessedFromLastMouseWheelEvent) {
            queuePostProcessedRowForCleanup(zombieRowCacheFromLastMouseWheelEvent,
              zombieRowPostProcessedFromLastMouseWheelEvent);
          } else {
            $canvas[0].removeChild(zombieRowNodeFromLastMouseWheelEvent);
          }
          zombieRowNodeFromLastMouseWheelEvent = null;
          zombieRowCacheFromLastMouseWheelEvent = null;
          zombieRowPostProcessedFromLastMouseWheelEvent = null;

          if (options.enableAsyncPostRenderCleanup) { startPostProcessingCleanup(); }
        }
        rowNodeFromLastMouseWheelEvent = rowNode;
      }
    }

    function handleDragInit(e, dd) {
      var cell = getCellFromEvent(e);
      if (!cell || !cellExists(cell.row, cell.cell)) {
        return false;
      }

      var retval = trigger(self.onDragInit, dd, e);
      if (e.isImmediatePropagationStopped()) {
        return retval;
      }

      // if nobody claims to be handling drag'n'drop by stopping immediate propagation,
      // cancel out of it
      return false;
    }

    function handleDragStart(e, dd) {
      var cell = getCellFromEvent(e);
      if (!cell || !cellExists(cell.row, cell.cell)) {
        return false;
      }

      var retval = trigger(self.onDragStart, dd, e);
      if (e.isImmediatePropagationStopped()) {
        return retval;
      }

      return false;
    }

    function handleDrag(e, dd) {
      return trigger(self.onDrag, dd, e);
    }

    function handleDragEnd(e, dd) {
      trigger(self.onDragEnd, dd, e);
    }

    //////////////////////////////////////////////////////////////////////////////////////////////
    // Ekohe Modify
    //   1. Use column's option to decide if make cell editable when ENTER

    function handleKeyDown(e) {
      trigger(self.onKeyDown, {row: activeRow, cell: activeCell, grid: self}, e);
      var handled = e.isImmediatePropagationStopped();
      var keyCode = Slick.keyCode;

      if (!handled) {
         if (!e.shiftKey && !e.altKey) {
            if (options.editable && currentEditor && currentEditor.keyCaptureList) {
               if (currentEditor.keyCaptureList.indexOf(e.which) > -1) {
                  return;
               }
            }
            if (e.which == keyCode.HOME) {
               handled = (e.ctrlKey) ? navigateTop() : navigateRowStart();
            } else if (e.which == keyCode.END) {
               handled = (e.ctrlKey) ? navigateBottom() : navigateRowEnd();
            }
         }
      }
      if (!handled) {
        if (!e.shiftKey && !e.altKey && !e.ctrlKey) {
          // editor may specify an array of keys to bubble
          if (options.editable && currentEditor && currentEditor.keyCaptureList) {
            if (currentEditor.keyCaptureList.indexOf( e.which ) > -1) {
                return;
            }
          }
          if (e.which == keyCode.ESCAPE) {
            if (!getEditorLock().isActive()) {
              return; // no editing mode to cancel, allow bubbling and default processing (exit without cancelling the event)
            }
            cancelEditAndSetFocus();
          } else if (e.which == keyCode.PAGE_DOWN) {
            navigatePageDown();
            handled = true;
          } else if (e.which == keyCode.PAGE_UP) {
            navigatePageUp();
            handled = true;
          } else if (e.which == keyCode.LEFT) {
            handled = navigateLeft();
          } else if (e.which == keyCode.RIGHT) {
            handled = navigateRight();
          } else if (e.which == keyCode.UP) {
            handled = navigateUp();
          } else if (e.which == keyCode.DOWN) {
            handled = navigateDown();
          } else if (e.which == keyCode.TAB) {
            handled = navigateNext();
          } else if (e.which == keyCode.ENTER) {
            // Ekohe Modify: Use editable option form column instead of grid
            // if (options.editable) {
            if (isColumnEditable(getColumns()[activeCell])) {
              if (currentEditor) {
                // adding new row
                if (activeRow === getDataLength()) {
                  navigateDown();
                } else {
                  commitEditAndSetFocus();
                }
              } else {
                if (getEditorLock().commitCurrentEdit()) {
                  makeActiveCellEditable();
                }
              }
            }
            handled = true;
          }
        } else if (e.which == keyCode.TAB && e.shiftKey && !e.ctrlKey && !e.altKey) {
          handled = navigatePrev();
        }
      }

      if (handled) {
        // the event has been handled so don't let parent element (bubbling/propagation) or browser (default) handle it
        e.stopPropagation();
        e.preventDefault();
        try {
          e.originalEvent.keyCode = 0; // prevent default behaviour for special keys in IE browsers (F3, F5, etc.)
        }
        // ignore exceptions - setting the original event's keycode throws access denied exception for "Ctrl"
        // (hitting control key only, nothing else), "Shift" (maybe others)
        catch (error) {
        }
      }
    }

    function handleClick(e) {
      if (!currentEditor) {
        // if this click resulted in some cell child node getting focus,
        // don't steal it back - keyboard events will still bubble up
        // IE9+ seems to default DIVs to tabIndex=0 instead of -1, so check for cell clicks directly.
        if (e.target != document.activeElement || $(e.target).hasClass("slick-cell")) {
          setFocus();
        }
      }

      var cell = getCellFromEvent(e);
      if (!cell || (currentEditor !== null && activeRow == cell.row && activeCell == cell.cell)) {
        return;
      }

      trigger(self.onClick, {row: cell.row, cell: cell.cell, grid: self}, e);
      if (e.isImmediatePropagationStopped()) {
        return;
      }

      // this optimisation causes trouble - MLeibman #329
      //if ((activeCell != cell.cell || activeRow != cell.row) && canCellBeActive(cell.row, cell.cell)) {
      if (canCellBeActive(cell.row, cell.cell)) {
        if (!getEditorLock().isActive() || getEditorLock().commitCurrentEdit()) {
          scrollRowIntoView(cell.row, false);

          var preClickModeOn = (e.target && e.target.className === Slick.preClickClassName);
          var column = columns[cell.cell];
          var suppressActiveCellChangedEvent = (options.editable && column && column.editor && options.suppressActiveCellChangeOnEdit) ? true : false;

          // https://gitlab.ekohe.com/ekohe/wulin/wulin_master/-/issues/180
          // Ekohe Edit start
          $(self.getContainerNode()).find(".slick-cell").removeClass("active")
          $(self.getContainerNode()).find(".slick-row").removeClass("active")
          // Ekohe Edit end

          setActiveCellInternal(getCellNode(cell.row, cell.cell), null, preClickModeOn, suppressActiveCellChangedEvent);
        }
      }
    }

    function handleContextMenu(e) {
      var $cell = $(e.target).closest(".slick-cell", $canvas);
      if ($cell.length === 0) {
        return;
      }

      // are we editing this cell?
      if (activeCellNode === $cell[0] && currentEditor !== null) {
        return;
      }

      trigger(self.onContextMenu, {grid: self}, e);
    }


    //////////////////////////////////////////////////////////////////////////////////////////////
    // Ekohe Modify
    //   1. Use column's option to decide if make cell editable

    function handleDblClick(e) {
      var cell = getCellFromEvent(e);
      if (!cell || (currentEditor !== null && activeRow == cell.row && activeCell == cell.cell)) {
        return;
      }

      trigger(self.onDblClick, {row: cell.row, cell: cell.cell, grid: self}, e);
      if (e.isImmediatePropagationStopped()) {
        return;
      }

      // Ekohe Add: Popup JSON viewer for jsonb data
      var column = columns[activeCell];
      if (column.type == 'jsonb') {
        var jsonData = JSON.parse(data[cell.row][column.column_name]);
        Ui.createJsonViewModal(jsonData);
        return;
      }

      if (column.formatter && column.formatter.name === "URLFormatter") {
        let url = data[cell.row][column.column_name]

        try {
          new URL(url)
          window.open(url, '_blank').focus()
        } catch (e) {
          console.error(e)
        }
        return
      }

      self.onDoubleClickBeforeColumnEdit.notify({grid: self, row: cell.row, activeCell: getColumns()[cell.cell]})
      // Ekohe Modify: Use column's editable option instead of grid's
      // if (options.editable) {
      if (isColumnEditable(getColumns()[cell.cell])) {
        gotoCell(cell.row, cell.cell, true);
      }
    }

    function handleHeaderMouseEnter(e) {
      trigger(self.onHeaderMouseEnter, {
        "column": $(this).data("column"),
        "grid": self
      }, e);
    }

    function handleHeaderMouseLeave(e) {
      trigger(self.onHeaderMouseLeave, {
        "column": $(this).data("column"),
        "grid": self
      }, e);
    }

    function handleHeaderContextMenu(e) {
      var $header = $(e.target).closest(".slick-header-column", ".slick-header-columns");
      var column = $header && $header.data("column");
      trigger(self.onHeaderContextMenu, {column: column, grid: self}, e);
    }

    function handleHeaderClick(e) {
      if (columnResizeDragging) return;
      var $header = $(e.target).closest(".slick-header-column", ".slick-header-columns");
      var column = $header && $header.data("column");
      if (column) {
        trigger(self.onHeaderClick, {column: column, grid: self}, e);
      }
    }

    function handleMouseEnter(e) {
      trigger(self.onMouseEnter, {grid: self}, e);
    }

    function handleMouseLeave(e) {
      trigger(self.onMouseLeave, {grid: self}, e);
    }

    function cellExists(row, cell) {
      return !(row < 0 || row >= getDataLength() || cell < 0 || cell >= columns.length);
    }

    function getCellFromPoint(x, y) {
      var row = getRowFromPosition(y);
      var cell = 0;

      var w = 0;
      for (var i = 0; i < columns.length && w < x; i++) {
        w += columns[i].width;
        cell++;
      }

      if (cell < 0) {
        cell = 0;
      }

      return {row: row, cell: cell - 1};
    }

    function getCellFromNode(cellNode) {
      // read column number from .l<columnNumber> CSS class
      var cls = /l\d+/.exec(cellNode.className);
      if (!cls) {
        throw new Error("getCellFromNode: cannot get cell - " + cellNode.className);
      }
      return parseInt(cls[0].substr(1, cls[0].length - 1), 10);
    }

    function getRowFromNode(rowNode) {
      for (var row in rowsCache) {
        if (rowsCache[row].rowNode === rowNode) {
          return row | 0;
        }
      }

      return null;
    }

    function getCellFromEvent(e) {
      var $cell = $(e.target).closest(".slick-cell", $canvas);
      if (!$cell.length) {
        return null;
      }

      var row = getRowFromNode($cell[0].parentNode);
      var cell = getCellFromNode($cell[0]);

      if (row == null || cell == null) {
        return null;
      } else {
        return {
          "row": row,
          "cell": cell
        };
      }
    }

    function getCellNodeBox(row, cell) {
      if (!cellExists(row, cell)) {
        return null;
      }

      var y1 = getRowTop(row);
      var y2 = y1 + options.rowHeight - 1;
      var x1 = 0;
      for (var i = 0; i < cell; i++) {
        x1 += columns[i].width;
      }
      var x2 = x1 + columns[cell].width;

      return {
        top: y1,
        left: x1,
        bottom: y2,
        right: x2
      };
    }

    //////////////////////////////////////////////////////////////////////////////////////////////
    // Cell switching

    function resetActiveCell() {
      setActiveCellInternal(null, false);
    }

    function setFocus() {
      if (tabbingDirection == -1) {
        $focusSink[0].focus();
      } else {
        $focusSink2[0].focus();
      }
    }

    function scrollCellIntoView(row, cell, doPaging) {
      scrollRowIntoView(row, doPaging);

      var colspan = getColspan(row, cell);
      internalScrollColumnIntoView(columnPosLeft[cell], columnPosRight[cell + (colspan > 1 ? colspan - 1 : 0)]);
    }

    function internalScrollColumnIntoView(left, right) {
      var scrollRight = scrollLeft + viewportW;

      if (left < scrollLeft) {
        $viewport.scrollLeft(left);
        handleScroll();
        render();
      } else if (right > scrollRight) {
        $viewport.scrollLeft(Math.min(left, right - $viewport[0].clientWidth));
        handleScroll();
        render();
      }
    }

    function scrollColumnIntoView(cell) {
      internalScrollColumnIntoView(columnPosLeft[cell], columnPosRight[cell]);
    }

    //////////////////////////////////////////////////////////////////////////////////////////////
    // Ekohe Edit
    //   1. Use new parameter `column_editable` to judge if make active or not


    // function setActiveCellInternal(newCell, opt_editMode, preClickModeOn, suppressActiveCellChangedEvent) {
    function setActiveCellInternal(newCell, opt_editMode, preClickModeOn, suppressActiveCellChangedEvent, column_editable) {
      if (activeCellNode !== null) {
        makeActiveCellNormal();
        $(activeCellNode).removeClass("active");
        if (rowsCache[activeRow]) {
          $(rowsCache[activeRow].rowNode).removeClass("active");
        }
      }

      var activeCellChanged = (activeCellNode !== newCell);
      activeCellNode = newCell;

      if (activeCellNode != null) {
        activeRow = getRowFromNode(activeCellNode.parentNode);
        activeCell = activePosX = getCellFromNode(activeCellNode);

        if (opt_editMode == null) {
          opt_editMode = (activeRow == getDataLength()) || options.autoEdit;
        }

        if (options.showCellSelection) {
          $(activeCellNode).addClass("active");
          $(rowsCache[activeRow].rowNode).addClass("active");
        }

        // Ekohe Add: Use new parameter `column_editable` to judge if make active or not
        // if (options.editable && opt_editMode && isCellPotentiallyEditable(activeRow, activeCell)) {
        if ((column_editable || options.editable) && opt_editMode && isCellPotentiallyEditable(activeRow, activeCell)) {
          clearTimeout(h_editorLoader);

          if (options.asyncEditorLoading) {
            h_editorLoader = setTimeout(function () {
              makeActiveCellEditable(undefined, preClickModeOn);
            }, options.asyncEditorLoadDelay);
          } else {
            makeActiveCellEditable(undefined, preClickModeOn);
          }
        }
      } else {
        activeRow = activeCell = null;
      }

      // this optimisation causes trouble - MLeibman #329
      //if (activeCellChanged) {
      if (!suppressActiveCellChangedEvent) { trigger(self.onActiveCellChanged, getActiveCell()); }
      //}
    }

    function clearTextSelection() {
      if (document.selection && document.selection.empty) {
        try {
          //IE fails here if selected element is not in dom
          document.selection.empty();
        } catch (e) { }
      } else if (window.getSelection) {
        var sel = window.getSelection();
        if (sel && sel.removeAllRanges) {
          sel.removeAllRanges();
        }
      }
    }

    function isCellPotentiallyEditable(row, cell) {
      var dataLength = getDataLength();
      // is the data for this row loaded?
      if (row < dataLength && !getDataItem(row)) {
        return false;
      }

      // are we in the Add New row?  can we create new from this cell?
      if (columns[cell].cannotTriggerInsert && row >= dataLength) {
        return false;
      }

      // does this cell have an editor?
      if (!getEditor(row, cell)) {
        return false;
      }

      return true;
    }

    function makeActiveCellNormal() {
      if (!currentEditor) {
        return;
      }
      trigger(self.onBeforeCellEditorDestroy, {editor: currentEditor, grid: self});
      currentEditor.destroy();
      currentEditor = null;

      if (activeCellNode) {
        var d = getDataItem(activeRow);
        $(activeCellNode).removeClass("editable invalid");
        if (d) {
          var column = columns[activeCell];
          var formatter = getFormatter(activeRow, column);
          var formatterResult =  formatter(activeRow, activeCell, getDataItemValueForColumn(d, column), column, d, self);
          applyFormatResultToCellNode(formatterResult, activeCellNode);
          invalidatePostProcessingResults(activeRow);
          if($(activeCellNode).hasClass('l0')) {
            $(activeCellNode).find('> span:first-child').css({'padding-left': '10px'})
          }
          // Incase chosen:hiding_dropdown event hasn't been trigger
          if($(activeCellNode).closest('.slick-viewport').css('overflow') == 'hidden') {
            $(activeCellNode).closest('.slick-viewport').css({overflow: 'auto'})
          }
        }
      }

      // if there previously was text selected on a page (such as selected text in the edit cell just removed),
      // IE can't set focus to anything else correctly
      if (navigator.userAgent.toLowerCase().match(/msie/)) {
        clearTextSelection();
      }

      getEditorLock().deactivate(editController);
    }

    function makeActiveCellEditable(editor, preClickModeOn) {
      if (!activeCellNode) {
        return;
      }

      // Ekohe Delete: Change to judge editable or not by specific column's `editable` option, not grid's
      // if (!options.editable) {
      //   throw new Error("Grid : makeActiveCellEditable : should never get called when options.editable is false");
      // }

      // cancel pending async call if there is one
      clearTimeout(h_editorLoader);

      if (!isCellPotentiallyEditable(activeRow, activeCell)) {
        return;
      }

      var columnDef = columns[activeCell];
      var item = getDataItem(activeRow);

      if (trigger(self.onBeforeEditCell, {row: activeRow, cell: activeCell, item: item, column: columnDef, grid: self}) === false) {
        setFocus();
        return;
      }

      getEditorLock().activate(editController);
      $(activeCellNode).addClass("editable");

      var useEditor = editor || getEditor(activeRow, activeCell);

      // don't clear the cell if a custom editor is passed through
      if (!editor && !useEditor.suppressClearOnEdit) {
        activeCellNode.innerHTML = "";
      }

      currentEditor = new useEditor({
        grid: self,
        gridPosition: absBox($container[0]),
        position: absBox(activeCellNode),
        container: activeCellNode,
        column: columnDef,
        item: item || {},
        commitChanges: commitEditAndSetFocus,
        cancelChanges: cancelEditAndSetFocus
      });

      if (item) {
        currentEditor.loadValue(item);
        if (preClickModeOn && currentEditor.preClick) {
          currentEditor.preClick();
        }
      }

      serializedEditorValue = currentEditor.serializeValue();

      if (currentEditor.position) {
        handleActiveCellPositionChange();
      }
    }

    function commitEditAndSetFocus() {
      // if the commit fails, it would do so due to a validation error
      // if so, do not steal the focus from the editor
      if (getEditorLock().commitCurrentEdit()) {
        setFocus();
        if (options.autoEdit) {
          navigateDown();
        }
      }
    }

    function cancelEditAndSetFocus() {
      if (getEditorLock().cancelCurrentEdit()) {
        setFocus();
      }
    }

    function absBox(elem) {
      var box = {
        top: elem.offsetTop,
        left: elem.offsetLeft,
        bottom: 0,
        right: 0,
        width: $(elem).outerWidth(),
        height: $(elem).outerHeight(),
        visible: true};
      box.bottom = box.top + box.height;
      box.right = box.left + box.width;

      // walk up the tree
      var offsetParent = elem.offsetParent;
      while ((elem = elem.parentNode) != document.body) {
        if (elem == null) break;

        if (box.visible && elem.scrollHeight != elem.offsetHeight && $(elem).css("overflowY") != "visible") {
          box.visible = box.bottom > elem.scrollTop && box.top < elem.scrollTop + elem.clientHeight;
        }

        if (box.visible && elem.scrollWidth != elem.offsetWidth && $(elem).css("overflowX") != "visible") {
          box.visible = box.right > elem.scrollLeft && box.left < elem.scrollLeft + elem.clientWidth;
        }

        box.left -= elem.scrollLeft;
        box.top -= elem.scrollTop;

        if (elem === offsetParent) {
          box.left += elem.offsetLeft;
          box.top += elem.offsetTop;
          offsetParent = elem.offsetParent;
        }

        box.bottom = box.top + box.height;
        box.right = box.left + box.width;
      }

      return box;
    }

    function getActiveCellPosition() {
      return absBox(activeCellNode);
    }

    function getGridPosition() {
      return absBox($container[0])
    }

    function handleActiveCellPositionChange() {
      if (!activeCellNode) {
        return;
      }

      trigger(self.onActiveCellPositionChanged, {grid: self});

      if (currentEditor) {
        var cellBox = getActiveCellPosition();
        if (currentEditor.show && currentEditor.hide) {
          if (!cellBox.visible) {
            currentEditor.hide();
          } else {
            currentEditor.show();
          }
        }

        if (currentEditor.position) {
          currentEditor.position(cellBox);
        }
      }
    }

    function getCellEditor() {
      return currentEditor;
    }

    function getActiveCell() {
      if (!activeCellNode) {
        return null;
      } else {
        return {row: activeRow, cell: activeCell, grid: self};
      }
    }

    // https://gitlab.ekohe.com/ekohe/wulin/wulin_master/-/issues/180
    // Ekohe Edit start
    function setActiveCellNode(node) {
      activeCellNode = node
    }

    function setActiveRow(row) {
      activeRow = row
    }

    function setActiveCellPosX(cell) {
      activeCell = cell
      activePosX = cell
    }

    // To generate random number
    function randomNumber() {
      return Math.round(1000000 * Math.random());
    }
    // Ekohe Edit end

    function getActiveCellNode() {
      return activeCellNode;
    }

    function scrollRowIntoView(row, doPaging) {
      var rowAtTop = row * options.rowHeight;
      var rowAtBottom = (row + 1) * options.rowHeight - viewportH + (viewportHasHScroll ? scrollbarDimensions.height : 0);

      // need to page down?
      if ((row + 1) * options.rowHeight > scrollTop + viewportH + offset) {
        scrollTo(doPaging ? rowAtTop : rowAtBottom);
        render();
      }
      // or page up?
      else if (row * options.rowHeight < scrollTop + offset) {
        scrollTo(doPaging ? rowAtBottom : rowAtTop);
        render();
      }
    }

    function scrollRowToTop(row) {
      scrollTo(row * options.rowHeight);
      render();
    }

    function scrollPage(dir) {
      var deltaRows = dir * numVisibleRows;
      scrollTo((getRowFromPosition(scrollTop) + deltaRows) * options.rowHeight);
      render();

      if (options.enableCellNavigation && activeRow != null) {
        var row = activeRow + deltaRows;
        var dataLengthIncludingAddNew = getDataLengthIncludingAddNew();
        if (row >= dataLengthIncludingAddNew) {
          row = dataLengthIncludingAddNew - 1;
        }
        if (row < 0) {
          row = 0;
        }

        var cell = 0, prevCell = null;
        var prevActivePosX = activePosX;
        while (cell <= activePosX) {
          if (canCellBeActive(row, cell)) {
            prevCell = cell;
          }
          cell += getColspan(row, cell);
        }

        if (prevCell !== null) {
          setActiveCellInternal(getCellNode(row, prevCell));
          activePosX = prevActivePosX;
        } else {
          resetActiveCell();
        }
      }
    }

    function navigatePageDown() {
      scrollPage(1);
    }

    function navigatePageUp() {
      scrollPage(-1);
    }

    function navigateTop() {
       navigateToRow(0);
    }

    function navigateBottom() {
       navigateToRow(getDataLength()-1);
    }

    function navigateToRow(row) {
       var num_rows = getDataLength();
       if (!num_rows) return true;

       if (row < 0) row = 0;
       else if (row >= num_rows) row = num_rows - 1;

       scrollCellIntoView(row, 0, true);
       if (options.enableCellNavigation && activeRow != null) {
          var cell = 0, prevCell = null;
          var prevActivePosX = activePosX;
          while (cell <= activePosX) {
             if (canCellBeActive(row, cell)) {
                prevCell = cell;
             }
             cell += getColspan(row, cell);
          }

          if (prevCell !== null) {
             setActiveCellInternal(getCellNode(row, prevCell));
             activePosX = prevActivePosX;
          } else {
             resetActiveCell();
          }
       }
       return true;
    }

    function getColspan(row, cell) {
      var metadata = data.getItemMetadata && data.getItemMetadata(row);
      if (!metadata || !metadata.columns) {
        return 1;
      }

      var columnData = metadata.columns[columns[cell].id] || metadata.columns[cell];
      var colspan = (columnData && columnData.colspan);
      if (colspan === "*") {
        colspan = columns.length - cell;
      } else {
        colspan = colspan || 1;
      }

      return colspan;
    }

    function findFirstFocusableCell(row) {
      var cell = 0;
      while (cell < columns.length) {
        if (canCellBeActive(row, cell)) {
          return cell;
        }
        cell += getColspan(row, cell);
      }
      return null;
    }

    function findLastFocusableCell(row) {
      var cell = 0;
      var lastFocusableCell = null;
      while (cell < columns.length) {
        if (canCellBeActive(row, cell)) {
          lastFocusableCell = cell;
        }
        cell += getColspan(row, cell);
      }
      return lastFocusableCell;
    }

    function gotoRight(row, cell, posX) {
      if (cell >= columns.length) {
        return null;
      }

      do {
        cell += getColspan(row, cell);
      }
      while (cell < columns.length && !canCellBeActive(row, cell));

      if (cell < columns.length) {
        return {
          "row": row,
          "cell": cell,
          "posX": cell
        };
      }
      return null;
    }

    function gotoLeft(row, cell, posX) {
      if (cell <= 0) {
        return null;
      }

      var firstFocusableCell = findFirstFocusableCell(row);
      if (firstFocusableCell === null || firstFocusableCell >= cell) {
        return null;
      }

      var prev = {
        "row": row,
        "cell": firstFocusableCell,
        "posX": firstFocusableCell
      };
      var pos;
      while (true) {
        pos = gotoRight(prev.row, prev.cell, prev.posX);
        if (!pos) {
          return null;
        }
        if (pos.cell >= cell) {
          return prev;
        }
        prev = pos;
      }
    }

    function gotoDown(row, cell, posX) {
      var prevCell;
      var dataLengthIncludingAddNew = getDataLengthIncludingAddNew();
      while (true) {
        if (++row >= dataLengthIncludingAddNew) {
          return null;
        }

        prevCell = cell = 0;
        while (cell <= posX) {
          prevCell = cell;
          cell += getColspan(row, cell);
        }

        if (canCellBeActive(row, prevCell)) {
          return {
            "row": row,
            "cell": prevCell,
            "posX": posX
          };
        }
      }
    }

    function gotoUp(row, cell, posX) {
      var prevCell;
      while (true) {
        if (--row < 0) {
          return null;
        }

        prevCell = cell = 0;
        while (cell <= posX) {
          prevCell = cell;
          cell += getColspan(row, cell);
        }

        if (canCellBeActive(row, prevCell)) {
          return {
            "row": row,
            "cell": prevCell,
            "posX": posX
          };
        }
      }
    }

    function gotoNext(row, cell, posX) {
      if (row == null && cell == null) {
        row = cell = posX = 0;
        if (canCellBeActive(row, cell)) {
          return {
            "row": row,
            "cell": cell,
            "posX": cell
          };
        }
      }

      var pos = gotoRight(row, cell, posX);
      if (pos) {
        return pos;
      }

      var firstFocusableCell = null;
      var dataLengthIncludingAddNew = getDataLengthIncludingAddNew();

      // if at last row, cycle through columns rather than get stuck in the last one
      if (row === dataLengthIncludingAddNew - 1) { row--; }

      while (++row < dataLengthIncludingAddNew) {
        firstFocusableCell = findFirstFocusableCell(row);
        if (firstFocusableCell !== null) {
          return {
            "row": row,
            "cell": firstFocusableCell,
            "posX": firstFocusableCell
          };
        }
      }
      return null;
    }

    function gotoPrev(row, cell, posX) {
      if (row == null && cell == null) {
        row = getDataLengthIncludingAddNew() - 1;
        cell = posX = columns.length - 1;
        if (canCellBeActive(row, cell)) {
          return {
            "row": row,
            "cell": cell,
            "posX": cell
          };
        }
      }

      var pos;
      var lastSelectableCell;
      while (!pos) {
        pos = gotoLeft(row, cell, posX);
        if (pos) {
          break;
        }
        if (--row < 0) {
          return null;
        }

        cell = 0;
        lastSelectableCell = findLastFocusableCell(row);
        if (lastSelectableCell !== null) {
          pos = {
            "row": row,
            "cell": lastSelectableCell,
            "posX": lastSelectableCell
          };
        }
      }
      return pos;
    }

    function gotoRowStart(row, cell, posX) {
       var newCell = findFirstFocusableCell(row);
       if (newCell === null) return null;

       return {
          "row": row,
          "cell": newCell,
          "posX": posX
       };
    }

    function gotoRowEnd(row, cell, posX) {
       var newCell = findLastFocusableCell(row);
       if (newCell === null) return null;

       return {
          "row": row,
          "cell": newCell,
          "posX": posX
       };
    }

    function navigateRight() {
      return navigate("right");
    }

    function navigateLeft() {
      return navigate("left");
    }

    function navigateDown() {
      return navigate("down");
    }

    function navigateUp() {
      return navigate("up");
    }

    function navigateNext() {
      return navigate("next");
    }

    function navigatePrev() {
      return navigate("prev");
    }

    function navigateRowStart() {
       return navigate("home");
    }

    function navigateRowEnd() {
       return navigate("end");
    }

    /**
     * @param {string} dir Navigation direction.
     * @return {boolean} Whether navigation resulted in a change of active cell.
     */
    function navigate(dir) {
      if (!options.enableCellNavigation) {
        return false;
      }

      if (!activeCellNode && dir != "prev" && dir != "next") {
        return false;
      }

      if (!getEditorLock().commitCurrentEdit()) {
        return true;
      }
      setFocus();

      var tabbingDirections = {
        "up": -1,
        "down": 1,
        "left": -1,
        "right": 1,
        "prev": -1,
        "next": 1,
        "home": -1,
        "end": 1
      };
      tabbingDirection = tabbingDirections[dir];

      var stepFunctions = {
        "up": gotoUp,
        "down": gotoDown,
        "left": gotoLeft,
        "right": gotoRight,
        "prev": gotoPrev,
        "next": gotoNext,
        "home": gotoRowStart,
        "end": gotoRowEnd
      };
      var stepFn = stepFunctions[dir];
      var pos = stepFn(activeRow, activeCell, activePosX);
      if (pos) {
        var isAddNewRow = (pos.row == getDataLength());
        scrollCellIntoView(pos.row, pos.cell, !isAddNewRow && options.emulatePagingWhenScrolling);
        setActiveCellInternal(getCellNode(pos.row, pos.cell));
        activePosX = pos.posX;
        return true;
      } else {
        setActiveCellInternal(getCellNode(activeRow, activeCell));
        return false;
      }
    }

    function getCellNode(row, cell) {
      if (rowsCache[row]) {
        ensureCellNodesInRowsCache(row);
        return rowsCache[row].cellNodesByColumnIdx[cell];
      }
      return null;
    }

    function setActiveCell(row, cell, opt_editMode, preClickModeOn, suppressActiveCellChangedEvent) {
      if (!initialized) { return; }
      if (row > getDataLength() || row < 0 || cell >= columns.length || cell < 0) {
        return;
      }

      if (!options.enableCellNavigation) {
        return;
      }

      scrollCellIntoView(row, cell, false);
      setActiveCellInternal(getCellNode(row, cell), opt_editMode, preClickModeOn, suppressActiveCellChangedEvent);
    }

    function canCellBeActive(row, cell) {
      if (!options.enableCellNavigation || row >= getDataLengthIncludingAddNew() ||
          row < 0 || cell >= columns.length || cell < 0) {
        return false;
      }

      var rowMetadata = data.getItemMetadata && data.getItemMetadata(row);
      if (rowMetadata && typeof rowMetadata.focusable !== "undefined") {
        return !!rowMetadata.focusable;
      }

      var columnMetadata = rowMetadata && rowMetadata.columns;
      if (columnMetadata && columnMetadata[columns[cell].id] && typeof columnMetadata[columns[cell].id].focusable !== "undefined") {
        return !!columnMetadata[columns[cell].id].focusable;
      }
      if (columnMetadata && columnMetadata[cell] && typeof columnMetadata[cell].focusable !== "undefined") {
        return !!columnMetadata[cell].focusable;
      }

      return !!columns[cell].focusable;
    }

    function canCellBeSelected(row, cell) {
      if (row >= getDataLength() || row < 0 || cell >= columns.length || cell < 0) {
        return false;
      }

      var rowMetadata = data.getItemMetadata && data.getItemMetadata(row);
      if (rowMetadata && typeof rowMetadata.selectable !== "undefined") {
        return !!rowMetadata.selectable;
      }

      var columnMetadata = rowMetadata && rowMetadata.columns && (rowMetadata.columns[columns[cell].id] || rowMetadata.columns[cell]);
      if (columnMetadata && typeof columnMetadata.selectable !== "undefined") {
        return !!columnMetadata.selectable;
      }

      return !!columns[cell].selectable;
    }

    //////////////////////////////////////////////////////////////////////////////////////////////
    // Ekohe Modify
    //   1. Pass new param `column_editable` to judge if set the cell active or not

    function gotoCell(row, cell, forceEdit) {
      if (!initialized) { return; }
      if (!canCellBeActive(row, cell)) {
        return;
      }

      if (!getEditorLock().commitCurrentEdit()) {
        return;
      }

      scrollCellIntoView(row, cell, false);

      var newCell = getCellNode(row, cell);

      // if selecting the 'add new' row, start editing right away

      // Ekohe Modify: Pass new param `column_editable` to judge if set the cell active or not
      // setActiveCellInternal(newCell, (forceEdit || (row === getDataLength()) || options.autoEdit), null, options.editable);
      setActiveCellInternal(
        newCell,
        (forceEdit || (row === getDataLength()) || options.autoEdit),
        null,
        options.editable,
        isColumnEditable(getColumns()[cell])
      )

      // if no editor was created, set the focus back on the grid
      if (!currentEditor) {
        setFocus();
      }
    }


    //////////////////////////////////////////////////////////////////////////////////////////////
    // IEditor implementation for the editor lock
    //
    // Ekohe Edit
    //   1. Use current cell instead of the whole row for submit in onCellChange trigger

    function commitCurrentEdit() {
      var item = getDataItem(activeRow);
      var column = columns[activeCell];

      if (currentEditor) {
        if (currentEditor.isValueChanged()) {
          var validationResults = currentEditor.validate();

          if (validationResults.valid) {
            if (activeRow < getDataLength()) {
              var editCommand = {
                row: activeRow,
                cell: activeCell,
                editor: currentEditor,
                serializedValue: currentEditor.serializeValue(),
                prevSerializedValue: serializedEditorValue,
                execute: function () {
                  this.editor.applyValue(item, this.serializedValue);
                  updateRow(this.row);
                  // Ekohe Delete: Original SlickGrid Logic: Submit item for the whole row
                  // trigger(self.onCellChange, {
                  //   row: activeRow,
                  //   cell: activeCell,
                  //   item: item,
                  //   grid: self
                  // });
                },
                undo: function () {
                  this.editor.applyValue(item, this.prevSerializedValue);
                  updateRow(this.row);
                  // Ekohe Delete: Original SlickGrid Logic: Submit item for the whole row
                  // trigger(self.onCellChange, {
                  //   row: activeRow,
                  //   cell: activeCell,
                  //   item: item,
                  //   grid: self
                  // });
                }
              };

              if (options.editCommandHandler) {
                makeActiveCellNormal();
                options.editCommandHandler(item, column, editCommand);
              } else {
                editCommand.execute();
                makeActiveCellNormal();
              }

              // Ekohe Add: Use item info of current cell for submit in onCellChange trigger
              var submitItem = {};
              submitItem['id'] = item.id;
              submitItem[column.field] = item[column.field];
              trigger(self.onCellChange, {
                row: activeRow,
                cell: activeCell,
                item: submitItem,
                editCommand: editCommand
              });

            } else {
              var newItem = {};
              currentEditor.applyValue(newItem, currentEditor.serializeValue());
              makeActiveCellNormal();
              trigger(self.onAddNewRow, {item: newItem, column: column, grid: self});
            }

            // check whether the lock has been re-acquired by event handlers
            return !getEditorLock().isActive();
          } else {
            // Re-add the CSS class to trigger transitions, if any.
            $(activeCellNode).removeClass("invalid");
            $(activeCellNode).width();  // force layout
            $(activeCellNode).addClass("invalid");

            trigger(self.onValidationError, {
              editor: currentEditor,
              cellNode: activeCellNode,
              validationResults: validationResults,
              row: activeRow,
              cell: activeCell,
              column: column,
              grid: self
            });

            currentEditor.focus();
            return false;
          }
        }

        makeActiveCellNormal();
      }
      return true;
    }

    function cancelCurrentEdit() {
      makeActiveCellNormal();
      return true;
    }

    function rowsToRanges(rows) {
      var ranges = [];
      var lastCell = columns.length - 1;
      for (var i = 0; i < rows.length; i++) {
        ranges.push(new Slick.Range(rows[i], 0, rows[i], lastCell));
      }
      return ranges;
    }

    function getSelectedRows() {
      if (!selectionModel) {
        throw new Error("Selection model is not set");
      }
      return selectedRows;
    }

    function setSelectedRows(rows) {
      if (!selectionModel) {
        throw new Error("Selection model is not set");
      }
      // If maxSelectRows is set. When click 'select all'. It should reset select rows to the limit count and refresh list
      var maxSelectRows = options.checkbox.maxSelectRows;
      if (maxSelectRows != null) {
        if (rows.length > maxSelectRows) {
          M.toast({html: "You can only select " + maxSelectRows + " rows.", displayLength: 5000})
          rows = rows.slice(0, maxSelectRows);
          selectionModel.setSelectedRanges(rowsToRanges(rows));
          this.finishInitialization();
          return;
        }
      }
      selectionModel.setSelectedRanges(rowsToRanges(rows));
    }

    //////////////////////////////////////////////////////////////////////////////////////////////
    // Debug

    this.debug = function () {
      var s = "";

      s += ("\n" + "counter_rows_rendered:  " + counter_rows_rendered);
      s += ("\n" + "counter_rows_removed:  " + counter_rows_removed);
      s += ("\n" + "renderedRows:  " + renderedRows);
      s += ("\n" + "numVisibleRows:  " + numVisibleRows);
      s += ("\n" + "maxSupportedCssHeight:  " + maxSupportedCssHeight);
      s += ("\n" + "n(umber of pages):  " + n);
      s += ("\n" + "(current) page:  " + page);
      s += ("\n" + "page height (ph):  " + ph);
      s += ("\n" + "vScrollDir:  " + vScrollDir);

      alert(s);
    };

    // a debug helper to be able to access private members
    this.eval = function (expr) {
      return eval(expr);
    };

    //////////////////////////////////////////////////////////////////////////////////////////////
    // Ekohe Add

    function getHeaders() {
      return $headers[0];
    }

    function getRows() {
      return rowsCache;
    }

    function getRowAt(i){
      return rowsCache[i];
    }

    function getCanvas(){
      return $canvas;
    }

    function getSerializedEditorValue(){
      return serializedEditorValue;
    }

    function setColumnsById(c){
      columnsById = c;
    }

    function setEditController(c){
      editController = c;
    }

    function isColumnEditable(column_option) {
      const readOnlyPermissionKey = [self.columnpicker.getCurrentUserId(), 'read_only_permission'].join(":")
      if(column_option.editable == undefined) {
        return options.editable;
      } else if((column_option.editable === true) && column_option.hasOwnProperty(readOnlyPermissionKey) && (column_option[readOnlyPermissionKey] === true)){
        //override editable if current_user has only read permission
        return column_option.editable = false
      }else {
        return column_option.editable;
      }
    }
    function renderLoadingRows(range) {
      var stringArray = [];
      var colCount = $headers.children().length;

      // Rows
      for (var i = range.top, ii = range.bottom; i < ii; i++) {
        var rowCss = "slick-row loading" + (i % 2 == 1 ? " odd" : " even");
        stringArray.push(
          "<div class='ui-widget-content " + rowCss +
          "' style='top:" + getRowTop(i) + "px'>"
        );

        // Columns
        var colspan;
        for (var j = 0, jj = colCount; j < jj; j++) {
          colspan = 1;
          var cellCss = "slick-cell loading l" + j +
                        " r" + Math.min(colCount - 1, j + colspan - 1);
          stringArray.push("<div style='height:10px' class='" + cellCss + "'></div>");
          if (colspan > 1) {
            i += (colspan - 1);
          }
        }

        stringArray.push("</div>");
      }

      var gridElement = document.createElement("div");
      gridElement.innerHTML = stringArray.join("");

      for (var i = range.top, ii = range.bottom; i < ii; i++) {
        $canvas[0].appendChild(gridElement.firstChild);
      }
    }

    function getFilteredInputs(){
      return $container
        .find('.slick-header-column input:text')
        .filter(function () { return !!this.value; });
    }

    // Remove columns which have option of visible:false when initialize the grid
    function removeInvisibleColumns() {
      var columns = getColumns();

      var tmp = [];
      for (var i = 0; i < columns.length; i++) {
        if (columns[i].visible != false) {
          tmp.push(columns[i]);
        }
      }
      setColumns(tmp);
    }

    function isEditing(){
      return getCellEditor() != null;
    }

    function getRowByRecordId(id) {
      var data = getData();
      if (data.length == 0 || data.length > 0 && !data[0]) {
        if (self.loader) data = self.loader.oldData;
      }
      for(var i in data) {
        if (data.hasOwnProperty(i) && i !== 'length' && data[i] && data[i].id == id) { return { row: getRowAt(i), index: i}; };
      }
    }

    function getSelectedIds() {
      try {
        var selectedIndexes = getSelectedRows();
        var ids;
        if (selectedIndexes.length > 0) {
          ids = $.map(selectedIndexes,function(n, i) {
            return getDataItem(n)['id'];
          });
          return ids;
        } else {
          return [];
        }
      } catch (e) {
        alert('You selected too many rows! Please select again.');
      }
    }

    function resizeAndRender() {
      if (options.forceFitColumns) {
        autosizeColumns();
      } else {
        resizeCanvas();
      }
    }

    function initialRender() {
      resizeAndRender();
      trigger(self.onRendered, {});
    }

    //////////////////////////////////////////////////////////////////////////////////////////////
    // Public API

    $.extend(this, {
      "slickGridVersion": "2.3.19",

      // Events
      "onScroll": new Slick.Event(),
      "onSort": new Slick.Event(),
      "onHeaderMouseEnter": new Slick.Event(),
      "onHeaderMouseLeave": new Slick.Event(),
      "onHeaderContextMenu": new Slick.Event(),
      "onHeaderClick": new Slick.Event(),
      "onHeaderCellRendered": new Slick.Event(),
      "onBeforeHeaderCellDestroy": new Slick.Event(),
      "onHeaderRowCellRendered": new Slick.Event(),
      "onFooterRowCellRendered": new Slick.Event(),
      "onBeforeHeaderRowCellDestroy": new Slick.Event(),
      "onBeforeFooterRowCellDestroy": new Slick.Event(),
      "onMouseEnter": new Slick.Event(),
      "onMouseLeave": new Slick.Event(),
      "onClick": new Slick.Event(),
      "onDblClick": new Slick.Event(),
      "onContextMenu": new Slick.Event(),
      "onKeyDown": new Slick.Event(),
      "onAddNewRow": new Slick.Event(),
      "onBeforeAppendCell": new Slick.Event(),
      "onValidationError": new Slick.Event(),
      "onViewportChanged": new Slick.Event(),
      "onColumnsReordered": new Slick.Event(),
      "onColumnsResized": new Slick.Event(),
      "onCellChange": new Slick.Event(),
      "onBeforeEditCell": new Slick.Event(),
      "onBeforeCellEditorDestroy": new Slick.Event(),
      "onBeforeDestroy": new Slick.Event(),
      "onActiveCellChanged": new Slick.Event(),
      "onActiveCellPositionChanged": new Slick.Event(),
      "onDragInit": new Slick.Event(),
      "onDragStart": new Slick.Event(),
      "onDrag": new Slick.Event(),
      "onDragEnd": new Slick.Event(),
      "onSelectedRowsChanged": new Slick.Event(),
      "onCellCssStylesChanged": new Slick.Event(),

      // Ekohe Add: New events
      "onRendered": new Slick.Event(),
      "onCanvasResized": new Slick.Event(),
      "onUpdatedByAjax": new Slick.Event(),
      "onDeletedByAjax": new Slick.Event(),
      "onAddExtraRowClasses": new Slick.Event(),
      "onAddExtraCellClasses": new Slick.Event(),
      "onOpenCreateModalEnd": new Slick.Event(),
      "onOpenEditModalEnd": new Slick.Event(),
      "onRelationCellEdit": new Slick.Event(),
      "onHasManyCellEdit": new Slick.Event(),
      "onDoubleClickBeforeColumnEdit": new Slick.Event(),
      "onTextEditorInit": new Slick.Event(),

      // Methods
      "registerPlugin": registerPlugin,
      "unregisterPlugin": unregisterPlugin,
      "getColumns": getColumns,
      "setColumns": setColumns,
      "getColumnIndex": getColumnIndex,
      "updateColumnHeader": updateColumnHeader,
      "setSortColumn": setSortColumn,
      "setSortColumns": setSortColumns,
      "getSortColumns": getSortColumns,
      "autosizeColumns": autosizeColumns,
      "getOptions": getOptions,
      "setOptions": setOptions,
      "getData": getData,
      "getDataLength": getDataLength,
      "getDataItem": getDataItem,
      "setData": setData,
      "getSelectionModel": getSelectionModel,
      "setSelectionModel": setSelectionModel,
      "getSelectedRows": getSelectedRows,
      "setSelectedRows": setSelectedRows,
      "getContainerNode": getContainerNode,
      "updatePagingStatusFromView": updatePagingStatusFromView,
      "restoreButtons": restoreButtons,

      "render": render,
      "invalidate": invalidate,
      "invalidateRow": invalidateRow,
      "invalidateRows": invalidateRows,
      "invalidateAllRows": invalidateAllRows,
      "updateCell": updateCell,
      "updateRow": updateRow,
      "getViewport": getVisibleRange,
      "getRenderedRange": getRenderedRange,
      "resizeCanvas": resizeCanvas,
      "updateRowCount": updateRowCount,
      "scrollRowIntoView": scrollRowIntoView,
      "scrollRowToTop": scrollRowToTop,
      "scrollCellIntoView": scrollCellIntoView,
      "scrollColumnIntoView": scrollColumnIntoView,
      "getCanvasNode": getCanvasNode,
      "getUID": getUID,
      "getHeaderColumnWidthDiff": getHeaderColumnWidthDiff,
      "getScrollbarDimensions": getScrollbarDimensions,
      "getHeadersWidth": getHeadersWidth,
      "getCanvasWidth": getCanvasWidth,
      "focus": setFocus,
      "scrollTo": scrollTo,

      "getCellFromPoint": getCellFromPoint,
      "getCellFromEvent": getCellFromEvent,
      "getActiveCell": getActiveCell,
      "setActiveCell": setActiveCell,
      "getActiveCellNode": getActiveCellNode,
      "setActiveCellNode": setActiveCellNode,
      "setActiveRow": setActiveRow,
      "setActiveCell": setActiveCell,
      "setActiveCellPosX": setActiveCellPosX,
      "getActiveCellPosition": getActiveCellPosition,
      "resetActiveCell": resetActiveCell,
      "editActiveCell": makeActiveCellEditable,
      "getCellEditor": getCellEditor,
      "getCellNode": getCellNode,
      "getCellNodeBox": getCellNodeBox,
      "canCellBeSelected": canCellBeSelected,
      "canCellBeActive": canCellBeActive,
      "navigatePrev": navigatePrev,
      "navigateNext": navigateNext,
      "navigateUp": navigateUp,
      "navigateDown": navigateDown,
      "navigateLeft": navigateLeft,
      "navigateRight": navigateRight,
      "navigatePageUp": navigatePageUp,
      "navigatePageDown": navigatePageDown,
      "navigateTop": navigateTop,
      "navigateBottom": navigateBottom,
      "navigateRowStart": navigateRowStart,
      "navigateRowEnd": navigateRowEnd,
      "gotoCell": gotoCell,
      "getTopPanel": getTopPanel,
      "setTopPanelVisibility": setTopPanelVisibility,
      "getPreHeaderPanel": getPreHeaderPanel,
      "setPreHeaderPanelVisibility": setPreHeaderPanelVisibility,
      "getHeader": getHeader,
      "getHeaderColumn": getHeaderColumn,
      "setHeaderRowVisibility": setHeaderRowVisibility,
      "getHeaderRow": getHeaderRow,
      "getHeaderRowColumn": getHeaderRowColumn,
      "setFooterRowVisibility": setFooterRowVisibility,
      "getFooterRow": getFooterRow,
      "getFooterRowColumn": getFooterRowColumn,
      "getGridPosition": getGridPosition,
      "flashCell": flashCell,
      "addCellCssStyles": addCellCssStyles,
      "setCellCssStyles": setCellCssStyles,
      "removeCellCssStyles": removeCellCssStyles,
      "getCellCssStyles": getCellCssStyles,

      "init": finishInitialization,
      "destroy": destroy,

      // IEditor implementation
      "getEditorLock": getEditorLock,
      "getEditController": getEditController,

      // Ekohe Add: New APIs
      "getHeaders": getHeaders,
      "getRows": getRows,
      "getRowAt": getRowAt,
      "getCanvas": getCanvas,
      "getSelectedIds": getSelectedIds,
      "getRowByRecordId": getRowByRecordId,
      "getSerializedEditorValue": getSerializedEditorValue,
      "setColumnsById": setColumnsById,
      "setEditController": setEditController,
      "setActiveCellInternal": setActiveCellInternal,
      "finishInitialization": finishInitialization,
      "handleDblClick": handleDblClick,
      "makeActiveCellNormal": makeActiveCellNormal,
      "renderLoadingRows": renderLoadingRows,
      "getFilteredInputs": getFilteredInputs,
      "setupColumnSort": setupColumnSort,
      "isEditing": isEditing,
      "initialRender": initialRender,
      "trigger": trigger,
      "renderFilteredInputs": renderFilteredInputs,
      "triggerDOM": triggerDOM
    });

    init();
  }
}(jQuery));
