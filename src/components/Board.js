import React from 'react';
import _ from 'underscore';
import ReactTimeout from 'react-timeout'
import Column from './Column';
import TaskWrapper from './TaskWrapper';

import {
  PanResponder,
  Animated,
  ScrollView
} from 'react-native';

class Board extends React.Component {
  MAX_RANGE = 100
  MAX_DEG = 30
  MOVE_INTERVAL = 5

  constructor(props) {
    super(props);

    this.verticalOffset = 0;

    this.state = {
      rotate: new Animated.Value(0),
      startingX: 0,
      startingY: 0,
      x: 0,
      y: 0,
      movingMode: false,
    };

    this.panResponder = PanResponder.create({
      onStartShouldSetPanResponder: () => this.state.movingMode,
      onMoveShouldSetPanResponder: () => this.state.movingMode,
      onPanResponderTerminationRequest: () => !this.state.movingMode,
      onPanResponderMove: this.onPanResponderMove.bind(this),
      onPanResponderRelease: this.onPanResponderRelease.bind(this),
      onPanResponderTerminate: this.onPanResponderRelease.bind(this)
    })
  }

  componentWillUnmount() {
    this.unsubscribeFromMovingMode();
  }

  onPanResponderMove(event, gesture, callback) {
    const leftTopCornerX = this.state.startingX + gesture.dx;
    const leftTopCornerY = this.state.startingY + gesture.dy;
    if (this.state.movingMode) {
      const draggedItem = this.state.draggedItem;
      this.x = event.nativeEvent.pageX;
      this.y = event.nativeEvent.pageY;
      const columnAtPosition = this.props.rowRepository.move(draggedItem, this.x, this.y);
      if (columnAtPosition) {
        let { scrolling, offset } = this.props.rowRepository.scrollingPosition(columnAtPosition, this.x, this.y);
        if (scrolling) {
          this.scroll(columnAtPosition, draggedItem, offset);
        }
      }

      this.setState({
        x: leftTopCornerX,
        y: leftTopCornerY
      });
    }
  }

  onScrollingStarted() {
    this.scrolling = true;
  }

  onScrollingEnded() {
    this.scrolling = false;
  }

  isScrolling() {
    return this.scrolling;
  }

  scroll(column, draggedItem, anOffset) {
    if (!this.isScrolling()) {
      this.onScrollingStarted();
      const scrollOffset = column.scrollOffset() + 50 * anOffset;
      this.props.rowRepository.setScrollOffset(column.id(), scrollOffset);

      column.listView().scrollTo({ y: scrollOffset });
    }

    this.props.rowRepository.move(draggedItem, this.x, this.y);
    let { scrolling, offset } = this.props.rowRepository.scrollingPosition(column, this.x, this.y);
    if (scrolling) {
      this.props.setTimeout(() => {
        this.scroll(column, draggedItem, offset);
      }, 1000);
    }
  }

  endMoving() {
    this.setState({ movingMode: false });
    const { srcColumnId, draggedItem } = this.state;
    const { rowRepository, onDragEnd } = this.props;
    rowRepository.show(draggedItem.columnId(), draggedItem);
    rowRepository.notify(draggedItem.columnId(), 'reload');

    const destColumnId = draggedItem.columnId();
    onDragEnd && onDragEnd(srcColumnId, destColumnId, draggedItem);
  }

  onPanResponderRelease(e, gesture) {
    this.x = null;
    this.y = null;
    if (this.state.movingMode) {
      this.rotateBack();
      this.props.setTimeout(this.endMoving.bind(this), 1000);
    } else if (this.isScrolling()) {
      this.unsubscribeFromMovingMode();
    }
  }

  rotateTo(value) {
    Animated.spring(
      this.state.rotate,
      {
        toValue: value,
        duration: 5000
      }
    ).start();
  }

  rotate() {
    this.rotateTo(this.MAX_DEG);
  }

  rotateBack() {
    this.rotateTo(0);
  }

  open(row) {
    this.unsubscribeFromMovingMode();
    this.props.open(row);
  }

  unsubscribeFromMovingMode() {
    this.props.clearTimeout(this.movingSubscription);
  }

  onPressIn(columnId, item, columnCallback) {
    return () => {
      this.movingSubscription = this.props.setTimeout(() => {
        const { x, y } = item.layout();
        this.props.rowRepository.hide(columnId, item);
        this.setState({
          movingMode: true,
          draggedItem: item,
          srcColumnId: item.columnId(),
          startingX: x,
          startingY: y,
          x: x,
          y: y,
        });
        columnCallback();
        this.rotate();
        this.unsubscribeFromMovingMode();
      }, 500);
    }
  }

  onPress(item) {
    return () => {
      if (!this.state.movingMode) {
        this.open(item.row());
      } else {
        this.endMoving();
      }
    }
  }

  onScrollEnd(event) {
    this.props.rowRepository.updateColumnsLayoutAfterVisibilityChanged();
    this.verticalOffset = event.nativeEvent.contentOffset.x;
  }

  movingStyle() {
    var interpolatedRotateAnimation = this.state.rotate.interpolate({
      inputRange: [-this.MAX_RANGE, 0, this.MAX_RANGE],
      outputRange: [`-${this.MAX_DEG}deg`, '0deg', `${this.MAX_DEG}deg`]
    });
    return Object.assign({}, {
      transform: [{rotate: interpolatedRotateAnimation}],
      position: 'absolute',
      zIndex: 1,
      top: this.state.y,
      left: this.verticalOffset + this.state.x
    });
  }

  movingTask() {
    const { draggedItem } = this.state;
    const data = { item: draggedItem, hidden: !this.state.movingMode, style: this.movingStyle() };
    return this.renderWrapperRow(data);
  }

  renderWrapperRow(data) {
    const { renderRow } = this.props;
    return (
      <TaskWrapper {...data}>
        {renderRow && data.item && renderRow(data.item.row())}
      </TaskWrapper>
    );
  }

  render() {
    const columns = this.props.rowRepository.columns();
    const columnWrappers = columns.map((column) => {
      const columnComponent = (
        <Column
          column={column}
          movingMode={this.state.movingMode}
          rowRepository={this.props.rowRepository}
          onPressIn={this.onPressIn.bind(this)}
          onPress={this.onPress.bind(this)}
          onPanResponderMove={this.onPanResponderMove.bind(this)}
          onPanResponderRelease={this.onPanResponderRelease.bind(this)}
          renderWrapperRow={this.renderWrapperRow.bind(this)}
          onScrollingStarted={this.onScrollingStarted.bind(this)}
          onScrollingEnded={this.onScrollingEnded.bind(this)}
          unsubscribeFromMovingMode={this.unsubscribeFromMovingMode.bind(this)}
        />
      );
      return this.props.renderColumnWrapper(column.data(), column.index(), columnComponent);
    });

    return (
      <ScrollView
        style={this.props.style}
        scrollEnabled={!this.state.movingMode}
        onScrollEndDrag={this.onScrollEnd.bind(this)}
        onMomentumScrollEnd={this.onScrollEnd.bind(this)}
        horizontal={true}
        {...this.panResponder.panHandlers}
      >
        {this.movingTask()}
        {columnWrappers}
      </ScrollView>
    )
  }
}

export default ReactTimeout(Board);
